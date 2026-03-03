#!/usr/bin/env node
/**
 * Crinkl Email Receipt Agent
 *
 * Scans your email for billing receipts from approved vendors,
 * verifies DKIM signatures, and submits them to earn BTC rewards.
 *
 * Supports two email providers:
 *   - Gmail (default) — requires Google OAuth credentials
 *   - AgentMail — dedicated inbox, no OAuth needed
 *
 * Privacy: Emails are processed in memory.
 * Only individual .eml files are sent to Crinkl for verification.
 *
 * Usage:
 *   crinkl-agent                # scan + submit via Gmail (default)
 *   crinkl-agent --agentmail    # scan + submit via AgentMail inbox
 *   crinkl-agent --auth         # just set up Gmail auth
 *   crinkl-agent --scan         # scan only (dry run, no submit)
 *   crinkl-agent --help         # show help
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.js";
import {
  getGmailClient,
  searchReceiptEmails,
  downloadRawEml,
  getMessageSubject,
} from "./gmail.js";
import { CrinklClient } from "./crinkl.js";
import { loadVendors } from "./vendors.js";
import {
  listMessages,
  downloadRawEml as agentmailDownloadRawEml,
  senderEmail,
  type AgentMailConfig,
} from "./agentmail.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, "..", "package.json"), "utf-8"));
const VERSION: string = pkg.version;

const SUBMITTED_IDS_FILE = resolve(
  process.env.HOME || "~",
  ".crinkl",
  "submitted-emails.json"
);

const HELP = `
Crinkl Email Receipt Agent

Scans your email for billing receipts from approved vendors,
verifies DKIM signatures, and submits them to Crinkl for BTC rewards.

Usage:
  crinkl-agent                Scan + submit via Gmail (default)
  crinkl-agent --agentmail    Scan + submit via AgentMail inbox
  crinkl-agent --auth         Set up Gmail authorization only
  crinkl-agent --scan         Dry run — preview without submitting
  crinkl-agent --help         Show this help

Environment variables (or .env file):
  CRINKL_API_KEY          Your Crinkl agent API key (required)
  CRINKL_API_URL          API base URL (default: https://api.crinkl.xyz)
  MAX_EMAIL_AGE_DAYS      How far back to search (default: 14)

Gmail mode (default):
  GMAIL_CLIENT_ID         Google OAuth client ID
  GMAIL_CLIENT_SECRET     Google OAuth client secret

AgentMail mode (--agentmail):
  AGENTMAIL_API_KEY       AgentMail API key (from console.agentmail.to)
  AGENTMAIL_INBOX_ID      AgentMail inbox ID to monitor

Get started:
  1. Get an API key at https://app.crinkl.xyz (Profile → Crinkl Agent Keys → Create key)
  2a. Gmail: Create a Google OAuth app + set GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET
  2b. AgentMail: Get an API key from console.agentmail.to + set AGENTMAIL_API_KEY
  3. Copy .env.example to .env and fill in your credentials
  4. Run: crinkl-agent (or crinkl-agent --agentmail)
`.trim();

/** Load set of already-submitted Gmail message IDs */
function loadSubmittedIds(): Set<string> {
  if (!existsSync(SUBMITTED_IDS_FILE)) return new Set();
  try {
    const data = JSON.parse(readFileSync(SUBMITTED_IDS_FILE, "utf-8"));
    return new Set(Array.isArray(data) ? data : []);
  } catch {
    return new Set();
  }
}

/** Save submitted IDs to disk */
function saveSubmittedIds(ids: Set<string>): void {
  mkdirSync(dirname(SUBMITTED_IDS_FILE), { recursive: true });
  writeFileSync(SUBMITTED_IDS_FILE, JSON.stringify([...ids], null, 2));
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(HELP);
    return;
  }

  const authOnly = args.includes("--auth");
  const scanOnly = args.includes("--scan");
  const useAgentMail = args.includes("--agentmail");

  console.log(`Crinkl Email Receipt Agent v${VERSION}\n`);

  // 1. Load config
  const config = loadConfig({ agentmail: useAgentMail });
  const crinkl = new CrinklClient(config);

  if (useAgentMail) {
    await runAgentMailPath(config, crinkl, scanOnly);
  } else {
    await runGmailPath(config, crinkl, authOnly, scanOnly);
  }
}

async function runAgentMailPath(
  config: ReturnType<typeof loadConfig>,
  crinkl: CrinklClient,
  scanOnly: boolean
) {
  const agentmailApiKey = process.env.AGENTMAIL_API_KEY;
  const agentmailInboxId = process.env.AGENTMAIL_INBOX_ID;

  if (!agentmailApiKey) {
    console.error("AGENTMAIL_API_KEY is required for --agentmail mode.");
    console.error("Get one from https://console.agentmail.to");
    process.exit(1);
  }
  if (!agentmailInboxId) {
    console.error("AGENTMAIL_INBOX_ID is required for --agentmail mode.");
    console.error("Create an inbox via the AgentMail API or dashboard.");
    process.exit(1);
  }

  const amConfig: AgentMailConfig = { apiKey: agentmailApiKey };

  console.log(`Scanning AgentMail inbox (last ${config.maxEmailAgeDays} days)...\n`);

  // Calculate "after" date for filtering
  const afterDate = new Date();
  afterDate.setDate(afterDate.getDate() - config.maxEmailAgeDays);
  const afterIso = afterDate.toISOString();

  // List all messages — no vendor filtering. The inbox is purpose-built for
  // receipts. Unknown vendors get 202 (queued for review) and the server
  // adds them to the allowlist if DKIM is valid.
  const messages = await listMessages(amConfig, agentmailInboxId, {
    limit: 50,
    after: afterIso,
  });

  if (messages.length === 0) {
    console.log(
      `No messages in AgentMail inbox in the last ${config.maxEmailAgeDays} days.`
    );
    return;
  }

  console.log(`Found ${messages.length} messages.\n`);

  const submittedIds = loadSubmittedIds();
  let submitted = 0;
  let skipped = 0;
  let errors = 0;

  for (const msg of messages) {
    if (submittedIds.has(msg.messageId)) {
      skipped++;
      continue;
    }

    const from = senderEmail(msg.from) || "unknown";
    console.log(`\n--- Processing: ${msg.subject} (from: ${from})`);

    try {
      const rawEml = await agentmailDownloadRawEml(
        amConfig,
        agentmailInboxId,
        msg.messageId
      );

      const preview = await crinkl.verifyEmailReceipt(rawEml);

      if (!preview.success) {
        console.log(`  SKIP: ${preview.error}`);
        submittedIds.add(msg.messageId);
        skipped++;
        continue;
      }

      const data = preview.data!;
      const amount = (data.totalCents / 100).toFixed(2);
      console.log(
        `  DKIM: ${data.dkimVerified ? "PASS" : "FAIL"} (${data.dkimDomain})`
      );
      console.log(`  Amount: $${amount} ${data.currency}`);
      console.log(`  Date: ${data.date}`);
      if (data.invoiceId) console.log(`  Invoice: ${data.invoiceId}`);

      if (!data.dkimVerified) {
        console.log("  SKIP: DKIM verification failed");
        submittedIds.add(msg.messageId);
        skipped++;
        continue;
      }

      if (scanOnly) {
        console.log(
          "  DRY RUN: would submit (run without --scan to submit)"
        );
        continue;
      }

      const result = await crinkl.submitEmailReceipt(rawEml);

      if (result.status === "QUEUED_FOR_REVIEW") {
        console.log(
          `  QUEUED: vendor ${result.domain || "unknown"} not yet approved — will retry next run`
        );
        skipped++;
      } else if (result.success && result.data) {
        console.log(
          `  SUBMITTED: ${result.data.store} — $${amount} — status: ${result.data.status}`
        );
        submittedIds.add(msg.messageId);
        submitted++;
      } else {
        console.log(`  ERROR: ${result.error}`);
        if (result.error?.includes("already been submitted")) {
          submittedIds.add(msg.messageId);
          skipped++;
        } else {
          errors++;
        }
      }
    } catch (err) {
      console.error(
        `  ERROR: ${err instanceof Error ? err.message : String(err)}`
      );
      errors++;
    }
  }

  saveSubmittedIds(submittedIds);

  console.log("\n--- Summary ---");
  console.log(`Provider: AgentMail`);
  console.log(`Submitted: ${submitted}`);
  console.log(`Skipped: ${skipped} (already submitted or non-receipt)`);
  if (errors > 0) console.log(`Errors: ${errors}`);
  console.log("");
}

async function runGmailPath(
  config: ReturnType<typeof loadConfig>,
  crinkl: CrinklClient,
  authOnly: boolean,
  scanOnly: boolean
) {
  // 2. Authenticate with Gmail
  console.log("Connecting to Gmail...");
  const gmail = await getGmailClient(config);
  console.log("Gmail connected.\n");

  if (authOnly) {
    console.log("Auth setup complete. Run without --auth to scan emails.");
    return;
  }

  // 3. Load vendor allowlist (API-first, shipped fallback)
  const vendors = await loadVendors(config.crinklApiUrl);
  console.log(
    `Scanning for ${vendors.length} vendors: ${vendors.map((v) => v.name).join(", ")}\n`
  );

  // 4. Search Gmail for receipt emails
  const emails = await searchReceiptEmails(
    gmail,
    vendors,
    config.maxEmailAgeDays
  );
  if (emails.length === 0) {
    console.log(
      "No receipt emails found in the last " +
        config.maxEmailAgeDays +
        " days."
    );
    return;
  }

  // 5. Process each email
  const submittedIds = loadSubmittedIds();
  let submitted = 0;
  let skipped = 0;
  let errors = 0;

  for (const email of emails) {
    // Dedup: skip already-submitted emails
    if (submittedIds.has(email.messageId)) {
      skipped++;
      continue;
    }

    const subject = await getMessageSubject(gmail, email.messageId);
    console.log(`\n--- Processing: ${subject}`);

    try {
      // Download raw .eml (in memory only)
      const rawEml = await downloadRawEml(gmail, email.messageId);

      // Preview: verify DKIM first
      const preview = await crinkl.verifyEmailReceipt(rawEml);

      if (!preview.success) {
        console.log(`  SKIP: ${preview.error}`);
        // Mark as "seen" to avoid retrying non-DKIM emails
        submittedIds.add(email.messageId);
        skipped++;
        continue;
      }

      const data = preview.data!;
      const amount = (data.totalCents / 100).toFixed(2);
      console.log(
        `  DKIM: ${data.dkimVerified ? "PASS" : "FAIL"} (${data.dkimDomain})`
      );
      console.log(`  Amount: $${amount} ${data.currency}`);
      console.log(`  Date: ${data.date}`);
      if (data.invoiceId) console.log(`  Invoice: ${data.invoiceId}`);

      if (!data.dkimVerified) {
        console.log("  SKIP: DKIM verification failed");
        submittedIds.add(email.messageId);
        skipped++;
        continue;
      }

      if (scanOnly) {
        console.log(
          "  DRY RUN: would submit (run without --scan to submit)"
        );
        continue;
      }

      // Submit for rewards
      const result = await crinkl.submitEmailReceipt(rawEml);

      if (result.status === "QUEUED_FOR_REVIEW") {
        console.log(
          `  QUEUED: vendor ${result.domain || "unknown"} not yet approved — will retry next run`
        );
        // Do NOT add to submittedIds — allow retry once vendor is approved
        skipped++;
      } else if (result.success && result.data) {
        console.log(
          `  SUBMITTED: ${result.data.store} — $${amount} — status: ${result.data.status}`
        );
        submittedIds.add(email.messageId);
        submitted++;
      } else {
        console.log(`  ERROR: ${result.error}`);
        if (result.error?.includes("already been submitted")) {
          submittedIds.add(email.messageId);
          skipped++;
        } else {
          errors++;
        }
      }
    } catch (err) {
      console.error(
        `  ERROR: ${err instanceof Error ? err.message : String(err)}`
      );
      errors++;
    }
  }

  // Save dedup state
  saveSubmittedIds(submittedIds);

  // Summary
  console.log("\n--- Summary ---");
  console.log(`Submitted: ${submitted}`);
  console.log(`Skipped: ${skipped} (already submitted or non-receipt)`);
  if (errors > 0) console.log(`Errors: ${errors}`);
  console.log("");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
