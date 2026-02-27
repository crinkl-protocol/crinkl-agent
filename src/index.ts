#!/usr/bin/env node
/**
 * Crinkl Email Receipt Agent
 *
 * Scans your Gmail for billing receipts from approved vendors,
 * verifies DKIM signatures, and submits them to earn BTC rewards.
 *
 * Privacy: Gmail OAuth runs locally. Emails are processed in memory.
 * Only individual .eml files are sent to Crinkl for verification.
 *
 * Usage:
 *   crinkl-agent            # scan + submit (default)
 *   crinkl-agent --auth     # just set up Gmail auth
 *   crinkl-agent --scan     # scan only (dry run, no submit)
 *   crinkl-agent --help     # show help
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { loadConfig } from "./config.js";
import {
  getGmailClient,
  searchReceiptEmails,
  downloadRawEml,
  getMessageSubject,
} from "./gmail.js";
import { CrinklClient } from "./crinkl.js";
import { getParser } from "./vendors/registry.js";

const SUBMITTED_IDS_FILE = resolve(
  process.env.HOME || "~",
  ".crinkl",
  "submitted-emails.json"
);

const HELP = `
Crinkl Email Receipt Agent

Scans your Gmail for billing receipts from approved vendors,
verifies DKIM signatures, and submits them to Crinkl for BTC rewards.

Usage:
  crinkl-agent            Scan + submit (default)
  crinkl-agent --auth     Set up Gmail authorization only
  crinkl-agent --scan     Dry run — preview without submitting
  crinkl-agent --help     Show this help

Environment variables (or .env file):
  CRINKL_API_KEY          Your Crinkl agent API key (required)
  GMAIL_CLIENT_ID         Google OAuth client ID (required)
  GMAIL_CLIENT_SECRET     Google OAuth client secret (required)
  CRINKL_API_URL          API base URL (default: https://api.crinkl.xyz)
  MAX_EMAIL_AGE_DAYS      How far back to search (default: 14)

Get started:
  1. Get an API key at https://app.crinkl.xyz
  2. Create a Google OAuth app at https://console.cloud.google.com/apis/credentials
  3. Copy .env.example to .env and fill in your credentials
  4. Run: crinkl-agent
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

  console.log("Crinkl Email Receipt Agent v0.1.0\n");

  // 1. Load config
  const config = loadConfig();
  const crinkl = new CrinklClient(config);

  // 2. Authenticate with Gmail
  console.log("Connecting to Gmail...");
  const gmail = await getGmailClient(config);
  console.log("Gmail connected.\n");

  if (authOnly) {
    console.log("Auth setup complete. Run without --auth to scan emails.");
    return;
  }

  // 3. Fetch allowed vendors from Crinkl
  console.log("Fetching allowed vendors...");
  const vendors = await crinkl.getAllowedVendors();
  console.log(
    `Allowed vendors: ${vendors.map((v) => v.displayName).join(", ")}\n`
  );

  if (vendors.length === 0) {
    console.log("No vendors are currently approved. Check back later.");
    return;
  }

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

      // Try local vendor parser (optional pre-parse for logging)
      const parser = getParser(data.dkimDomain);
      if (parser.name !== "generic") {
        console.log(`  Parser: ${parser.name}`);
      }

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
          `  QUEUED: vendor ${result.domain || "unknown"} not yet approved — queued for admin review`
        );
        submittedIds.add(email.messageId);
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
