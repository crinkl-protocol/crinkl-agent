/**
 * Gmail OAuth + email search/download.
 *
 * Privacy: OAuth tokens are stored locally only (~/.crinkl/gmail-credentials.json).
 * Only gmail.readonly scope is requested — no send/delete/modify access.
 * Emails are downloaded to memory (never written to disk).
 */

import { google } from "googleapis";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createInterface } from "node:readline";
import type { Config } from "./config.js";
import type { EmailSource, EmailMetadata } from "./pipeline.js";
import type { Vendor } from "./vendors.js";
import { RECEIPT_KEYWORDS } from "./filters.js";

const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];
const REDIRECT_URI = "http://localhost";

interface StoredCredentials {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
}

/** Get authenticated Gmail client. Runs OAuth flow on first use. */
export async function getGmailClient(config: Config, log: (line: string) => void = console.log, output: NodeJS.WritableStream = process.stdout) {
  const oauth2 = new google.auth.OAuth2(
    config.gmailClientId,
    config.gmailClientSecret,
    REDIRECT_URI
  );

  // Try loading saved credentials
  if (existsSync(config.credentialsPath)) {
    const saved: StoredCredentials = JSON.parse(
      readFileSync(config.credentialsPath, "utf-8")
    );
    oauth2.setCredentials(saved);
    return google.gmail({ version: "v1", auth: oauth2 });
  }

  // First-time OAuth flow
  const authUrl = oauth2.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });

  log("\n--- Gmail Authorization ---");
  log("1. Open this URL in your browser:\n");
  log(`   ${authUrl}\n`);
  log("2. Authorize the app. You'll be redirected to a page that won't load.");
  log("3. Copy the FULL URL from your browser's address bar and paste it below.\n");
  log("   It will look like: http://localhost?code=4/0AQ...\n");

  const rawUrl = await prompt("Paste the full redirect URL: ", output);

  // Extract code from the pasted URL
  let code: string;
  if (rawUrl.startsWith("http")) {
    const url = new URL(rawUrl);
    code = url.searchParams.get("code") || rawUrl;
  } else {
    code = rawUrl;
  }

  const { tokens } = await oauth2.getToken(code);
  oauth2.setCredentials(tokens);

  // Save credentials locally
  mkdirSync(dirname(config.credentialsPath), { recursive: true });
  writeFileSync(
    config.credentialsPath,
    JSON.stringify(tokens, null, 2),
    { mode: 0o600 }
  );
  log(`Credentials saved to ${config.credentialsPath}\n`);

  return google.gmail({ version: "v1", auth: oauth2 });
}

/** Search Gmail for receipt emails from allowed vendors */
export async function searchReceiptEmails(
  gmail: ReturnType<typeof google.gmail>,
  vendors: Array<{ domain: string }>,
  maxAgeDays: number
): Promise<Array<{ messageId: string; snippet: string }>> {
  if (vendors.length === 0) {
    console.log("No allowed vendors found.");
    return [];
  }

  // Build search query: from:@vendor1 OR from:@vendor2 ... newer_than:14d
  const fromClauses = vendors.map((v) => `from:@${v.domain}`).join(" OR ");
  const query = `(${fromClauses}) newer_than:${maxAgeDays}d`;

  console.log(`Searching Gmail: ${query}`);

  const response = await gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults: 50,
  });

  const messages = response.data.messages || [];
  console.log(`Found ${messages.length} matching emails.`);

  return messages.map((m) => ({
    messageId: m.id!,
    snippet: m.snippet || "",
  }));
}

/** Download raw .eml content for a message (in memory only — never written to disk) */
export async function downloadRawEml(
  gmail: ReturnType<typeof google.gmail>,
  messageId: string
): Promise<string> {
  const response = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "raw",
  });

  // Gmail returns URL-safe base64
  const raw = response.data.raw!;
  return Buffer.from(raw, "base64url").toString("utf-8");
}

/** Get the actual subject and From header separately. */
export async function getMessageMetadata(
  gmail: ReturnType<typeof google.gmail>,
  messageId: string
): Promise<EmailMetadata> {
  const response = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "metadata",
    metadataHeaders: ["Subject", "From"],
  });

  const headers = response.data.payload?.headers || [];
  const subject =
    headers.find((h) => h.name?.toLowerCase() === "subject")?.value || "(no subject)";
  const from = headers.find((h) => h.name?.toLowerCase() === "from")?.value || "";

  return { subject, from };
}

/** Discovery searches all receipt-like subjects, with no vendor restriction. */
export async function searchDiscoveryEmails(
  gmail: ReturnType<typeof google.gmail>,
  maxAgeDays: number
): Promise<Array<{ messageId: string }>> {
  const subjects = RECEIPT_KEYWORDS.map((word) => `subject:"${word}"`).join(" OR ");
  const q = `(${subjects}) newer_than:${maxAgeDays}d`;
  const messages: Array<{ messageId: string }> = [];
  let pageToken: string | undefined;
  do {
    const response = await gmail.users.messages.list({
      userId: "me", q, maxResults: 50, pageToken,
    });
    for (const message of response.data.messages || []) {
      if (message.id) messages.push({ messageId: message.id });
    }
    pageToken = response.data.nextPageToken || undefined;
  } while (pageToken);
  return messages;
}

export function gmailSource(
  gmail: ReturnType<typeof google.gmail>, vendors: Vendor[], maxAgeDays: number, discover = false
): EmailSource {
  return {
    listMessages: () => discover
      ? searchDiscoveryEmails(gmail, maxAgeDays)
      : searchReceiptEmails(gmail, vendors, maxAgeDays),
    getMetadata: (id) => getMessageMetadata(gmail, id),
    downloadRawEml: (id) => downloadRawEml(gmail, id),
  };
}

function prompt(question: string, output: NodeJS.WritableStream): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}
