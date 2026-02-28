# AGENTS.md

Machine-readable instructions for AI agents interacting with this repository.

## What Crinkl is

Crinkl is a progressive web app at [app.crinkl.xyz](https://app.crinkl.xyz) built on the [crinkl-protocol](https://github.com/crinkl-protocol/crinkl-protocol). It verifies real-world spend (receipts, billing emails) and produces **identity-free spend tokens** — cryptographic attestations with no personal data in the signed payload. Verified spend earns sats over Lightning.

Humans scan physical receipts with the PWA camera. Agents submit DKIM-signed billing emails via the REST API. Both produce the same protocol artifact.

## What this repo is

`crinkl-agent` is a reference implementation: a CLI that scans Gmail for DKIM-signed billing emails and submits them to the Crinkl API. It's ~200 lines of core logic — the server does all verification and data extraction.

**Repository**: `crinkl-protocol/crinkl-agent`
**Language**: TypeScript (strict, ESM)
**Runtime**: Node >= 20
**License**: MIT

## If you are building your own agent

You don't need this repo. You need:

1. A **Crinkl API key** — user generates one at [app.crinkl.xyz](https://app.crinkl.xyz) → Profile → Crinkl Agent Keys
2. A way to get **raw `.eml` files** from the user's email (Gmail, Outlook, IMAP, whatever)
3. **Two API calls**:

```bash
# What vendors are supported?
curl https://api.crinkl.xyz/api/agent/allowed-vendors

# Submit a receipt
curl -X POST https://api.crinkl.xyz/api/agent/submit-email-receipt \
  -H "Content-Type: application/json" \
  -H "x-api-key: crk_..." \
  -d '{"eml": "<base64-encoded .eml>"}'
```

**Response codes**:
- `201` — spend created, token minted, sats queued
- `202` — vendor not yet approved, submission queued for admin review (not rejected — will be processed if approved)
- `409` — duplicate (already submitted)
- `422` — validation error (DKIM failed, no amount extracted, too old)
- `429` — daily limit reached

Unknown vendors are **queued, not rejected**. If a user submits an email from a new vendor domain with valid DKIM, it enters a review queue. On approval, the vendor is added to the allowlist and the spend is created retroactively.

## API reference

### Public (no auth)

- `GET /api/agent/allowed-vendors` — list approved vendor domains

### Authenticated (`x-api-key` header)

- `POST /api/agent/submit-email-receipt` — submit base64 `.eml` for DKIM verification + spend creation
- `POST /api/agent/verify-email-receipt` — preview only (no spend created)
- `GET /api/agent/spends/:spendId/token/latest` — retrieve the signed spend attestation token

Base URL: `https://api.crinkl.xyz`

### MCP (read-only commerce intelligence)

```json
{
  "mcpServers": {
    "crinkl": {
      "url": "https://mcp.crinkl.xyz/mcp"
    }
  }
}
```

The public MCP server provides read-only tools for querying verified commerce data. Email receipt submission uses the REST API (requires an API key).

## If you are helping a user run this agent

### Prerequisites

1. **Crinkl API key** — user signs up at [app.crinkl.xyz](https://app.crinkl.xyz) (it's a PWA — works in any browser). Once they have a wallet: Profile → Crinkl Agent Keys → Create key. The `crk_...` key is shown once.
2. **Google OAuth credentials** — [Create OAuth Client ID](https://console.cloud.google.com/apis/credentials) (Desktop app) + [Enable Gmail API](https://console.cloud.google.com/apis/library/gmail.googleapis.com)
3. `.env` from `.env.example` with both credentials

### Run

```bash
npm install
npm run auth     # one-time Gmail OAuth
npm run dev      # scan + submit
```

### Commands

```
npm run dev              # scan Gmail + submit receipts
npm run dev -- --scan    # dry run (preview only)
npm run dev -- --auth    # set up Gmail auth only
```

### Data flow

```
Gmail (readonly) → crinkl-agent (local) → api.crinkl.xyz (DKIM verify + attest) → spend token → ₿ sats
```

Only individual `.eml` files leave the user's machine. No inbox access, credentials, or OAuth tokens are shared.

## If you are contributing code

### Architecture

```
src/
├── index.ts       # CLI entry — Gmail scan loop, submit/dedup logic
├── config.ts      # .env loader, Config type
├── gmail.ts       # Gmail OAuth + search + download
└── crinkl.ts      # Crinkl API client (verify, submit, vendors)
```

### Adding a new email provider

Currently Gmail only. To add Outlook, Yahoo, etc:

1. Create `src/<provider>.ts` implementing:
   - `connect(config)` — authenticate
   - `searchReceipts(client, vendors, maxAgeDays)` — find billing emails
   - `downloadEml(client, messageId)` — get raw `.eml` content
2. Add `--provider <name>` flag in `src/index.ts`
3. Include auth setup instructions in README

### Code conventions

- TypeScript strict mode, ESM modules
- `.js` extensions in all imports (Node ESM resolution)
- No runtime dependencies beyond `googleapis`
- No frameworks, no abstractions for one-time operations

```bash
npm install          # install deps
npm test             # run vitest
npm run lint         # tsc --noEmit
npm run build        # compile to dist/
```
