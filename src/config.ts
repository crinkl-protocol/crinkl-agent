/**
 * Configuration — loads from environment variables or .env file.
 * All secrets stay local on the user's machine.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface Config {
  crinklApiKey: string;
  crinklApiUrl: string;
  gmailClientId: string;
  gmailClientSecret: string;
  maxEmailAgeDays: number;
  credentialsPath: string;
}

/** Load .env file (simple key=value parser, no npm dep) */
function loadDotEnv(): void {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

export function loadConfig(): Config {
  loadDotEnv();

  const crinklApiKey = process.env.CRINKL_API_KEY;
  if (!crinklApiKey) {
    console.error(
      "CRINKL_API_KEY is required. Get one from https://app.crinkl.xyz (Profile → Settings → Crinkl Agent Keys)"
    );
    process.exit(1);
  }

  const gmailClientId = process.env.GMAIL_CLIENT_ID;
  const gmailClientSecret = process.env.GMAIL_CLIENT_SECRET;
  if (!gmailClientId || !gmailClientSecret) {
    console.error("GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET are required.");
    console.error(
      "Create an OAuth app at https://console.cloud.google.com/apis/credentials"
    );
    process.exit(1);
  }

  return {
    crinklApiKey,
    crinklApiUrl: process.env.CRINKL_API_URL || "https://api.crinkl.xyz",
    gmailClientId,
    gmailClientSecret,
    maxEmailAgeDays: parseInt(process.env.MAX_EMAIL_AGE_DAYS || "14", 10),
    credentialsPath: resolve(
      process.env.HOME || "~",
      ".crinkl",
      "gmail-credentials.json"
    ),
  };
}
