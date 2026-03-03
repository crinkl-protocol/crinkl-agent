<div align="center">

# crinkl-agent

Scan Gmail for SaaS billing emails. Submit them to [Crinkl](https://crinkl.xyz). Get sats over Lightning.

[Standalone CLI](#path-a-standalone-cli) · [OpenClaw Skill](#path-b-openclaw-skill) · [API](#api-reference) · [Privacy](#privacy)

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

---

## Two ways to use this

There are two independent paths. Pick the one that matches your setup.

### Path A: Standalone CLI

Run the agent yourself on any machine with Node.js. You manage Gmail OAuth directly.

#### 1. Get a Crinkl API key

Sign up at [app.crinkl.xyz](https://app.crinkl.xyz) — it's a PWA, works in any browser. Once you have a wallet:

**Profile → Crinkl Agent Keys → Create key**

This gives you a `crk_...` key tied to your wallet.

#### 2. Set up Google OAuth for Gmail

The agent needs read-only Gmail access to find billing emails. Here's the full setup:

1. **Create a Google Cloud project** (if you don't have one):
   - Go to [console.cloud.google.com](https://console.cloud.google.com)
   - Click the project dropdown → **New Project** → name it anything (e.g. "crinkl-agent")

2. **Enable the Gmail API**:
   - Go to [APIs & Services → Library](https://console.cloud.google.com/apis/library/gmail.googleapis.com)
   - Search for "Gmail API" → click **Enable**

3. **Configure the OAuth consent screen**:
   - Go to [APIs & Services → OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent)
   - Choose **External** (unless you have a Workspace org)
   - Fill in the required fields (app name, user support email, developer email)
   - Add scope: `https://www.googleapis.com/auth/gmail.readonly`
   - Under **Test users**, add your own Gmail address
   - Save. The app will be in "Testing" mode (limited to your test users — this is fine for personal use)

4. **Create OAuth credentials**:
   - Go to [APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials)
   - Click **Create Credentials → OAuth client ID**
   - Application type: **Desktop app**
   - Name it anything → click **Create**
   - Copy the **Client ID** and **Client secret**

5. **Set the redirect URI** (important):
   - In the OAuth client you just created, under **Authorized redirect URIs**, add: `http://localhost`
   - Save

> **Note**: When you first run the agent, Google will show an "app not verified" warning. Click **Advanced → Go to [app name] (unsafe)**. This is normal for personal OAuth apps in testing mode.

#### 3. Run

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

#### Commands

```
npm run dev              # scan Gmail + submit receipts
npm run dev -- --scan    # dry run (preview only, no submissions)
npm run dev -- --auth    # set up Gmail auth only
```

#### Run on a schedule

```bash
# Every 6 hours
0 */6 * * * cd /path/to/crinkl-agent && npm run dev >> ~/.crinkl/agent.log 2>&1
```

---

### Path B: OpenClaw Skill

For autonomous agents running on OpenClaw. Uses `gog` for Gmail access and the pairing API for key provisioning — no manual OAuth setup or `.env` files.

```bash
clawhub install gog             # Gmail access (74K+ installs)
clawhub install crinkl-claws    # receipt scanning + submission
```

On first run, the agent pairs with your Crinkl wallet automatically:

1. Agent shows a 4-character code
2. You type it in the Crinkl app (you're already logged in)
3. Agent gets its API key — done

No copy-paste, no navigating settings. The agent handles Gmail scanning, DKIM submission, and logging autonomously after that. See [SKILL.md](skills/crinkl-claws/SKILL.md) and [HEARTBEAT.md](skills/crinkl-claws/HEARTBEAT.md) for the full agent workflow.

---

## Supported vendors

The agent fetches the vendor allowlist from the API on each run, with a shipped fallback for offline use.

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
Returns: 201 (created) | 202 (queued for vendor review) | 409 (duplicate) | 422 (validation error) | 429 (rate limited)

POST https://api.crinkl.xyz/api/agent/verify-email-receipt
Body: { "eml": "<base64-encoded .eml>" }
Returns: 200 (preview without submitting)

GET https://api.crinkl.xyz/api/agent/me
Returns: your submission count, earned sats, wallet stats, current sats/receipt rate

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

15 tools covering GMV, spend signals, merchant analytics, settlement stats, cryptographic proofs, and reward policy. See [mcp.crinkl.xyz](https://mcp.crinkl.xyz) for the full tool list.

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
├── crinkl.ts      # Crinkl API client (verify, submit)
└── vendors.ts     # Vendor allowlist (API-first, shipped fallback)
```

~200 lines of core logic. The server does the hard part.

## License

[MIT](LICENSE)

---

<div align="center">

**[crinkl.xyz](https://crinkl.xyz)** · verified spend, identity detached

</div>
