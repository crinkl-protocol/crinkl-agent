import type { SubmitResult, VerifyResult } from "./crinkl.js";
import type { Vendor } from "./vendors.js";
import { isReceiptSubject, matchVendorDomain } from "./filters.js";

export interface EmailMetadata {
  subject: string;
  from: string;
}

export interface EmailSource {
  listMessages(): Promise<Array<{ messageId: string }>>;
  getMetadata(messageId: string): Promise<EmailMetadata>;
  downloadRawEml(messageId: string): Promise<string>;
}

export interface ReceiptClient {
  verifyEmailReceipt(rawEml: string): Promise<VerifyResult>;
  submitEmailReceipt(rawEml: string): Promise<SubmitResult>;
}

function dailyLimit(result: VerifyResult | SubmitResult): boolean {
  return result.httpStatus === 429 || result.code === "DAILY_RECEIPT_LIMIT_REACHED";
}

export async function processEmails(options: {
  source: EmailSource;
  client: ReceiptClient;
  vendors: Vendor[];
  submittedIds: Set<string>;
  scanOnly?: boolean;
  log?: (line: string) => void;
}) {
  const { source, client, vendors, submittedIds, scanOnly = false, log = console.log } = options;
  const summary = { submitted: 0, skipped: 0, errors: 0, dailyLimitReached: false };
  const stopAtLimit = () => {
    summary.dailyLimitReached = true;
    log("DAILY LIMIT: stopping this run; remaining emails will be retried next run.");
  };

  for (const { messageId } of await source.listMessages()) {
    if (submittedIds.has(messageId)) {
      summary.skipped++;
      continue;
    }
    try {
      const { subject, from } = await source.getMetadata(messageId);
      log(`\n--- Processing: ${subject} (from: ${from || "unknown"})`);
      const vendorDomain = matchVendorDomain(from, vendors);
      // Unknown AgentMail senders must still reach the server's review queue.
      if (vendorDomain && !isReceiptSubject(subject, vendorDomain)) {
        log(`  SKIP: not a receipt email for ${vendorDomain}`);
        submittedIds.add(messageId);
        summary.skipped++;
        continue;
      }

      const rawEml = await source.downloadRawEml(messageId);
      const preview = await client.verifyEmailReceipt(rawEml);
      if (dailyLimit(preview)) {
        stopAtLimit();
        break;
      }
      if (!preview.success || !preview.data) {
        // Only an explicit server validation rejection makes this email final.
        // Parsing, transport and service/auth failures must remain retryable.
        if (preview.validationRejected === true && (!preview.httpStatus || preview.httpStatus === 422)) {
          log(`  SKIP: ${preview.error || "Receipt preview failed"}`);
          submittedIds.add(messageId);
          summary.skipped++;
        } else {
          log(`  ERROR: ${preview.error || "Receipt preview failed"}`);
          summary.errors++;
        }
        continue;
      }

      const data = preview.data;
      const amount = (data.totalCents / 100).toFixed(2);
      log(`  DKIM: ${data.dkimVerified ? "PASS" : "FAIL"} (${data.dkimDomain})`);
      log(`  Amount: $${amount} ${data.currency}`);
      log(`  Date: ${data.date}`);
      if (data.invoiceId) log(`  Invoice: ${data.invoiceId}`);
      if (!data.dkimVerified) {
        log("  SKIP: DKIM verification failed");
        submittedIds.add(messageId);
        summary.skipped++;
        continue;
      }
      if (scanOnly) {
        log("  DRY RUN: would submit (run without --scan to submit)");
        continue;
      }

      const result = await client.submitEmailReceipt(rawEml);
      if (dailyLimit(result)) {
        stopAtLimit();
        break;
      }
      if (result.status === "QUEUED_FOR_REVIEW" || result.httpStatus === 202) {
        log(`  QUEUED: vendor ${result.domain || "unknown"} not yet approved — will retry next run`);
        summary.skipped++;
      } else if (result.success && result.data) {
        log(`  SUBMITTED: ${result.data.store} — $${amount} — status: ${result.data.status}`);
        submittedIds.add(messageId);
        summary.submitted++;
      } else if (result.httpStatus === 409 || result.error?.includes("already been submitted")) {
        log(`  SKIP: ${result.error || "already submitted"}`);
        submittedIds.add(messageId);
        summary.skipped++;
      } else {
        log(`  ERROR: ${result.error || "Receipt submission failed"}`);
        summary.errors++;
      }
    } catch (err) {
      log(`  ERROR: ${err instanceof Error ? err.message : String(err)}`);
      summary.errors++;
    }
  }
  return summary;
}
