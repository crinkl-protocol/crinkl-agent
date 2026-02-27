<div align="center">

```
 ██████╗██████╗ ██╗███╗   ██╗██╗  ██╗██╗
██╔════╝██╔══██╗██║████╗  ██║██║ ██╔╝██║
██║     ██████╔╝██║██╔██╗ ██║█████╔╝ ██║
██║     ██╔══██╗██║██║╚██╗██║██╔═██╗ ██║
╚██████╗██║  ██║██║██║ ╚████║██║  ██╗███████╗
 ╚═════╝╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝╚══════╝
               a g e n t
```

**Earn Bitcoin from email receipts you already have.**

[![CI](https://github.com/crinkl-protocol/crinkl-agent/actions/workflows/ci.yml/badge.svg)](https://github.com/crinkl-protocol/crinkl-agent/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-F7931A.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-18102A.svg)](https://nodejs.org)

[How it works](#how-it-works) · [Quick start](#quick-start) · [Add a vendor](#contributing) · [MCP](#for-ai-agents--mcp-clients) · [Privacy](#privacy)

</div>

---

> **AI agent?** Read [`AGENTS.md`](AGENTS.md) — structured instructions, API reference, contribution contract, and the MCP endpoint.

Your SaaS subscriptions generate DKIM-signed billing emails every month. This agent finds them, verifies the cryptographic signatures, and submits them to the [Crinkl protocol](https://crinkl.xyz) — which turns each one into a signed spend token and pays you in Bitcoin over Lightning.

You keep running the subscriptions anyway. Now they pay you back.

## How it works

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐     ┌─────────┐
│  Your Gmail  │────▶│  crinkl-agent │────▶│  Crinkl Protocol  │────▶│  ₿ sats  │
│  (readonly)  │     │  (local)      │     │  (DKIM + attest)  │     │  (yours) │
└─────────────┘     └──────────────┘     └──────────────────┘     └─────────┘
```

1. **Fetch** allowed vendors from the Crinkl API
2. **Search** Gmail for billing emails (last 14 days, read-only)
3. **Download** each email as raw `.eml` — in memory, never written to disk
4. **Verify** DKIM signature via the Crinkl verification endpoint
5. **Submit** valid receipts — Crinkl mints a spend token and queues your reward
6. **Dedup** locally so the same email is never submitted twice

## Quick start

### 1. Get a Crinkl API key

Generate one at [app.crinkl.xyz/profile/agent-keys](https://app.crinkl.xyz/profile/agent-keys).

### 2. Set up Gmail OAuth

1. [Create an OAuth 2.0 Client ID](https://console.cloud.google.com/apis/credentials) (type: Desktop app)
2. [Enable the Gmail API](https://console.cloud.google.com/apis/library/gmail.googleapis.com)

### 3. Run

```bash
npx crinkl-agent
```

Or clone and run locally:

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
0 */6 * * * cd /path/to/crinkl-agent && npx crinkl-agent >> ~/.crinkl/agent.log 2>&1
```

## Vendor parsers

The agent fetches the current vendor allowlist from the API:

```bash
curl https://api.crinkl.xyz/api/agent/allowed-vendors
```

Want to add a vendor? Write a parser, open a PR, and once it's merged we add the domain to the allowlist. Everyone running the agent earns from it. See [CONTRIBUTING.md](CONTRIBUTING.md).

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
- **Open source.** Audit every line.

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
