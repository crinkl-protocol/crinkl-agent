import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.js";
import { getGmailClient, gmailSource } from "./gmail.js";
import { agentmailSource } from "./agentmail.js";
import { CrinklClient } from "./crinkl.js";
import { loadVendors, type Vendor } from "./vendors.js";
import { processEmails, type EmailSource } from "./pipeline.js";
import { discoverSenders, formatDiscovery } from "./discovery.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, "..", "package.json"), "utf-8"));
const SUBMITTED_IDS_FILE = resolve(process.env.HOME || "~", ".crinkl", "submitted-emails.json");

const HELP = `
Crinkl Email Receipt Agent

Scans your email for billing receipts from approved vendors,
verifies DKIM signatures, and submits them to Crinkl for BTC rewards.

Usage:
  crinkl-agent                Scan + submit via Gmail (default)
  crinkl-agent --agentmail    Scan + submit via AgentMail inbox
  crinkl-agent --auth         Set up Gmail authorization only
  crinkl-agent --scan         Dry run — preview without submitting
  crinkl-agent --discover     Count unsupported receipt senders (no verify/submit)
  crinkl-agent --discover --json  Output domain counts as JSON
  crinkl-agent --help         Show this help

Environment variables (or .env file):
  CRINKL_API_KEY          Your Crinkl agent API key (required except --discover)
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

/** Load local dedup history shared by both providers. */
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

export interface CliOptions {
  help: boolean;
  authOnly: boolean;
  scanOnly: boolean;
  useAgentMail: boolean;
  discover: boolean;
  json: boolean;
}

export async function runCli(options: CliOptions): Promise<void> {
  if (options.help) {
    console.log(HELP);
    return;
  }
  if (options.json && !options.discover) throw new Error("--json requires --discover");
  if (options.authOnly && options.discover) throw new Error("Use --auth separately before --discover");
  const { useAgentMail, discover } = options;
  if (!discover) console.log(`Crinkl Email Receipt Agent v${pkg.version}\n`);
  const config = loadConfig({ agentmail: useAgentMail, discover });
  // Keep discovery stdout limited to the table or JSON, even on allowlist fallback.
  const log = discover ? console.error : console.log;
  let source: EmailSource;
  let vendors: Vendor[];
  if (useAgentMail) {
    const apiKey = process.env.AGENTMAIL_API_KEY;
    const inboxId = process.env.AGENTMAIL_INBOX_ID;
    if (!apiKey) throw new Error("AGENTMAIL_API_KEY is required for --agentmail mode.");
    if (!inboxId) throw new Error("AGENTMAIL_INBOX_ID is required for --agentmail mode.");
    vendors = await loadVendors(config.crinklApiUrl, log);
    source = agentmailSource({ apiKey }, inboxId, config.maxEmailAgeDays, discover);
    if (!discover) console.log(`Scanning AgentMail inbox (last ${config.maxEmailAgeDays} days)...\n`);
  } else {
    if (!discover) console.log("Connecting to Gmail...");
    const gmail = await getGmailClient(config, log, discover ? process.stderr : process.stdout);
    if (options.authOnly) {
      console.log("Auth setup complete. Run without --auth to scan emails.");
      return;
    }
    vendors = await loadVendors(config.crinklApiUrl, log);
    source = gmailSource(gmail, vendors, config.maxEmailAgeDays, discover);
    if (!discover) console.log(`Scanning for ${vendors.length} vendors: ${vendors.map((v) => v.name).join(", ")}\n`);
  }
  if (discover) {
    console.log(formatDiscovery(await discoverSenders(source, vendors), options.json));
    return;
  }
  const submittedIds = loadSubmittedIds();
  const summary = await processEmails({
    source, client: new CrinklClient(config), vendors, submittedIds, scanOnly: options.scanOnly,
  });
  saveSubmittedIds(submittedIds);
  console.log("\n--- Summary ---");
  if (useAgentMail) console.log("Provider: AgentMail");
  console.log(`Submitted: ${summary.submitted}`);
  console.log(`Skipped: ${summary.skipped} (already submitted or non-receipt)`);
  if (summary.errors > 0) console.log(`Errors: ${summary.errors}`);
  console.log("");
}
