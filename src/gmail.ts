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

const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];
const REDIRECT_URI = "http://localhost";

interface StoredCredentials {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
}

/** Get authenticated Gmail client. Runs OAuth flow on first use. */
export async function getGmailClient(config: Config) {
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

  console.log("\n--- Gmail Authorization ---");
  console.log("1. Open this URL in your browser:\n");
  console.log(`   ${authUrl}\n`);
  console.log("2. Authorize the app. You'll be redirected to a page that won't load.");
  console.log("3. Copy the FULL URL from your browser's address bar and paste it below.\n");
  console.log("   It will look like: http://localhost?code=4/0AQ...\n");

  const rawUrl = await prompt("Paste the full redirect URL: ");

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
  console.log(`Credentials saved to ${config.credentialsPath}\n`);

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

/** Get email subject for display */
export async function getMessageSubject(
  gmail: ReturnType<typeof google.gmail>,
  messageId: string
): Promise<string> {
  const response = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "metadata",
    metadataHeaders: ["Subject", "From", "Date"],
  });

  const headers = response.data.payload?.headers || [];
  const subject =
    headers.find((h) => h.name === "Subject")?.value || "(no subject)";
  const from = headers.find((h) => h.name === "From")?.value || "";
  const date = headers.find((h) => h.name === "Date")?.value || "";

  return `${date} | ${from} | ${subject}`;
}

function prompt(question: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}
