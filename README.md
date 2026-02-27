<div align="center">

<img src=".github/banner.png" alt="crinkl agent" width="600">

**DKIM-signed email receipts → verified spend tokens → sats over Lightning.**

[How it works](#how-it-works) · [Quick start](#quick-start) · [Vendors](#supported-vendors) · [MCP](#for-ai-agents--mcp-clients) · [Privacy](#privacy)

</div>

---

> **AI agent?** Read [`AGENTS.md`](AGENTS.md) — structured instructions, API reference, contribution contract, and the MCP endpoint.

SaaS subscriptions generate DKIM-signed billing emails. This agent scans Gmail for them, verifies the cryptographic signatures, and submits them to the [Crinkl protocol](https://crinkl.xyz). Each verified receipt produces a signed spend token and routes sats to the submitting wallet over Lightning.

> **Status:** Early access. API key generation is rolling out at [app.crinkl.xyz](https://app.crinkl.xyz) — not yet available to all users. Clone and run from source in the meantime.

## How it works

<img src=".github/flow.png" alt="Gmail → crinkl-agent → Crinkl Protocol → sats" width="600">

1. **Fetch** allowed vendors from the Crinkl API
2. **Search** Gmail for billing emails (last 14 days, read-only)
3. **Download** each email as raw `.eml` — in memory, never written to disk
4. **Verify** DKIM signature via the Crinkl verification endpoint
5. **Submit** valid receipts — Crinkl mints a spend token and queues your reward
6. **Dedup** locally so the same email is never submitted twice

## Quick start

### 1. Get a Crinkl API key

Generate one at [app.crinkl.xyz](https://app.crinkl.xyz) (agent key generation rolling out — not yet available to all users).

### 2. Set up Gmail OAuth

1. [Create an OAuth 2.0 Client ID](https://console.cloud.google.com/apis/credentials) (type: Desktop app)
2. [Enable the Gmail API](https://console.cloud.google.com/apis/library/gmail.googleapis.com)

### 3. Run

```bash
git clone https://github.com/crinkl-protocol/crinkl-agent.git
cd crinkl-agent
npm install
cp .env.example .env    # add your API key + OAuth credentials
npm run dev
```

First run opens a browser for Gmail authorization. The token is stored locally at `~/.crinkl/gmail-credentials.json`.

## Usage

```
crinkl-agent            Scan + submit
crinkl-agent --scan     Dry run — preview without submitting
crinkl-agent --auth     Set up Gmail auth only
crinkl-agent --help     Show help
```

### Run on a schedule

```bash
# Every 6 hours
0 */6 * * * cd /path/to/crinkl-agent && npm run dev >> ~/.crinkl/agent.log 2>&1
```

## Supported vendors

Verification requires a **DKIM-signed email**. The vendor must email you a receipt — web-only invoices (download from dashboard) have no DKIM signature and cannot be verified.

Canonical list: [`vendors/allowlist.json`](vendors/allowlist.json)

| Vendor | Domain | Category |
|--------|--------|----------|
| Gumroad | `gumroad.com` | Digital commerce |
| Stripe | `stripe.com` | Payments |
| Suno | `suno.com` | SaaS |
| Gamma | `gamma.app` | SaaS |
| OpenAI | `openai.com` | SaaS |

**Cannot support (no emailed receipts):** Anthropic — dashboard-only invoices, no DKIM.

> Want to add a vendor? Add it to [`vendors/allowlist.json`](vendors/allowlist.json) and open a PR. Once merged, the domain goes live on the API. Everyone running the agent earns from it.

Live API:

```bash
curl https://api.crinkl.xyz/api/agent/allowed-vendors
```

```
src/vendors/
├── types.ts       # VendorParser interface
├── registry.ts    # Parser lookup + registration
└── generic.ts     # Fallback (server does authoritative parsing)
```

## For AI agents / MCP clients

If you're an MCP-capable agent (Claude Desktop, Cursor, OpenClaw, etc.) — skip this repo and use the MCP server directly:

```json
{
  "mcpServers": {
    "crinkl": {
      "url": "https://mcp.crinkl.xyz/mcp"
    }
  }
}
```

Tools: `submit-email-receipt`, `verify-email-receipt`, `allowed-vendors`.

Not using MCP? See [`AGENTS.md`](AGENTS.md) for the REST API reference and structured contribution instructions.

## Privacy

This agent runs entirely on your machine. Here's what leaves it:

| Data | Destination | Purpose |
|------|-------------|---------|
| Individual `.eml` files | `api.crinkl.xyz` | DKIM verification + spend token minting |
| Nothing else | — | — |

- **Read-only Gmail access.** `gmail.readonly` scope — cannot send, delete, or modify.
- **No inbox access shared.** Crinkl receives individual emails, not inbox access.
- **OAuth token stays local.** Stored at `~/.crinkl/gmail-credentials.json`, never transmitted.

## Contributing

Add a vendor parser, add an email provider, or pick up an [open issue](https://github.com/crinkl-protocol/crinkl-agent/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22).

```bash
npm test             # run parser tests
npm run lint         # type check
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide and a test template.

## License

[MIT](LICENSE)

---

<div align="center">

**[crinkl.xyz](https://crinkl.xyz)** · facts first, identity detached

</div>
