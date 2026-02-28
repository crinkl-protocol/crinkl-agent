<div align="center">

# crinkl-agent

Scan Gmail for SaaS billing emails. Submit them to [Crinkl](https://crinkl.xyz). Get sats over Lightning.

[Quick start](#quick-start) · [API](#api-reference) · [Privacy](#privacy)

</div>

---

[Crinkl](https://crinkl.xyz) verifies real-world spend and mints **identity-free spend tokens** — cryptographic proofs with no personal data. This agent is a reference implementation for the [email receipt API](#api-reference). Humans scan physical receipts in the [PWA](https://app.crinkl.xyz). Agents submit DKIM-signed emails via REST. Both produce the same protocol artifact.

> Building your own agent? You may only need the [API endpoints](#api-reference).

## How it works

```
Gmail (readonly) → crinkl-agent (your machine) → api.crinkl.xyz (DKIM verify + attest) → spend token → ₿ sats
```

1. **Fetch** allowed vendors from the Crinkl API
2. **Search** Gmail for billing emails from those vendors (last 14 days, read-only)
3. **Download** each email as raw `.eml` — in memory, never written to disk
4. **Submit** to Crinkl — server verifies the DKIM signature, extracts invoice data, mints a spend token
5. **Dedup** locally so the same email is never submitted twice

The server does all verification and data extraction. The agent is just a pipe from your inbox to the API.

## Quick start

### 1. Get a Crinkl API key

Sign up at [app.crinkl.xyz](https://app.crinkl.xyz) — it's a PWA, works in any browser. Once you have a wallet:

**Profile → Crinkl Agent Keys → Create key**

This gives you a `crk_...` key tied to your wallet. Spend tokens minted by the agent are credited to this wallet.

### 2. Set up Gmail OAuth

1. [Create an OAuth 2.0 Client ID](https://console.cloud.google.com/apis/credentials) (type: Desktop app)
2. [Enable the Gmail API](https://console.cloud.google.com/apis/library/gmail.googleapis.com)

### 3. Run

```bash
npx crinkl-agent        # run directly via npm
```

Or clone for development:

```bash
git clone https://github.com/crinkl-protocol/crinkl-agent.git
cd crinkl-agent
npm install
cp .env.example .env    # add your API key + OAuth credentials
npm run auth            # one-time Gmail authorization
npm run dev             # scan + submit
```

### OpenClaw agents

```bash
clawhub install gmail-manager  # Gmail access (if not already installed)
clawhub install crinkl          # receipt scanning + submission
```

The crinkl skill scans Gmail directly using the `gmail-manager` skill. Your agent searches for vendor emails, downloads them, submits to the Crinkl API, logs results to memory, and posts about earnings on Moltbook — all autonomously during its heartbeat cycle.

**Human setup:** Get a Crinkl API key + authorize Gmail. That's it.

### Usage

```
npm run dev              # scan Gmail + submit receipts
npm run dev -- --scan    # dry run (preview only)
npm run dev -- --auth    # set up Gmail auth only
```

### Run on a schedule

```bash
# Every 6 hours
0 */6 * * * cd /path/to/crinkl-agent && npm run dev >> ~/.crinkl/agent.log 2>&1
```

## Supported vendors

The server maintains the allowlist. The agent fetches it on every run.

```bash
curl https://api.crinkl.xyz/api/agent/allowed-vendors
```

Vendors must send DKIM-signed billing emails. Web-only invoices (download from dashboard) have no DKIM signature and can't be verified.

If you submit an email from an unknown vendor, it's **queued for review** (not rejected). Once approved, the vendor is added to the allowlist and your spend is created retroactively.

> **Want to add a vendor?** Just submit an email from them. If the domain has valid DKIM, we'll review and approve it.

## API reference

### Public (no auth)

```
GET https://api.crinkl.xyz/api/agent/allowed-vendors
```

### Authenticated (`x-api-key` header)

```
POST https://api.crinkl.xyz/api/agent/submit-email-receipt
Body: { "eml": "<base64-encoded .eml>" }
Returns: 201 (created) | 202 (queued for vendor review) | 409 (duplicate) | 422 (validation error)

POST https://api.crinkl.xyz/api/agent/verify-email-receipt
Body: { "eml": "<base64-encoded .eml>" }
Returns: 200 (preview without submitting)

GET https://api.crinkl.xyz/api/agent/spends/:spendId/token/latest
Returns: the signed spend attestation token
```

### For MCP-capable agents

If you're running Claude Desktop, Cursor, OpenClaw, or any MCP client — you can use the public MCP server for read-only commerce intelligence:

```json
{
  "mcpServers": {
    "crinkl": {
      "url": "https://mcp.crinkl.xyz/mcp"
    }
  }
}
```

Email receipt submission uses the REST API above (requires an API key).

## Privacy

This agent runs on your machine. Here's what leaves it:

| Data | Destination | Purpose |
|------|-------------|---------|
| Individual `.eml` files | `api.crinkl.xyz` | DKIM verification + spend token minting |
| Nothing else | — | — |

- **Read-only Gmail access** — `gmail.readonly` scope. Cannot send, delete, or modify.
- **No inbox access shared** — Crinkl receives individual emails, not credentials or tokens.
- **OAuth token stays local** — stored at `~/.crinkl/gmail-credentials.json`.
- **Spend tokens are identity-free** — no email, no name, no account ID in the signed payload.

## Architecture

```
src/
├── index.ts       # CLI entry — Gmail scan loop, submit/dedup logic
├── config.ts      # .env loader
├── gmail.ts       # Gmail OAuth + search + download
└── crinkl.ts      # Crinkl API client (verify, submit, vendors)
```

~200 lines of core logic. The server does the hard part.

## License

[MIT](LICENSE)

---

<div align="center">

**[crinkl.xyz](https://crinkl.xyz)** · verified spend, identity detached

</div>
