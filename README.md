# crinkl-agent

Earn BTC from your email receipts. This agent scans your Gmail for billing emails from approved vendors, verifies their DKIM signatures, and submits them to [Crinkl](https://crinkl.xyz) for Bitcoin rewards.

## Quick start

### 1. Get a Crinkl API key

Go to [app.crinkl.xyz/profile/agent-keys](https://app.crinkl.xyz/profile/agent-keys) and generate a key.

### 2. Create a Google OAuth app

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create an OAuth 2.0 Client ID (type: **Desktop app**)
3. Enable the [Gmail API](https://console.cloud.google.com/apis/library/gmail.googleapis.com)

### 3. Run

```bash
npx crinkl-agent
```

Or clone and run locally:

```bash
git clone https://github.com/crinkl-protocol/crinkl-agent.git
cd crinkl-agent
npm install
cp .env.example .env    # fill in your credentials
npm run dev
```

On first run, you'll authorize Gmail access in your browser. The token is stored locally at `~/.crinkl/gmail-credentials.json`.

## Usage

```bash
crinkl-agent            # Scan + submit (default)
crinkl-agent --auth     # Set up Gmail auth only
crinkl-agent --scan     # Dry run — preview without submitting
crinkl-agent --help     # Show help
```

## How it works

1. **Fetches allowed vendors** from the Crinkl API (auto-updates as new vendors are approved)
2. **Searches Gmail** for receipt emails from those vendors (last 14 days)
3. **Downloads each email** in raw `.eml` format (in memory only)
4. **Verifies DKIM** via the Crinkl API
5. **Submits valid receipts** for Bitcoin rewards
6. **Tracks submitted emails** locally to avoid duplicates

## Privacy

- **Everything runs locally.** Gmail OAuth token stays on your machine.
- **Read-only access.** The agent requests `gmail.readonly` — it cannot send, delete, or modify emails.
- **Only `.eml` content is sent to Crinkl.** Individual receipt emails are submitted for DKIM verification. Crinkl never has access to your inbox.
- **Open source.** Audit every line of code.

## Running on a schedule

```bash
# Scan every 6 hours
0 */6 * * * cd /path/to/crinkl-agent && npx crinkl-agent >> ~/.crinkl/agent.log 2>&1
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to add vendor parsers and email provider adapters.

## Allowed vendors

The vendor list is fetched dynamically:

```bash
curl https://api.crinkl.xyz/api/agent/allowed-vendors
```

## MCP alternative

If you use Claude Desktop or Cursor, you can use Crinkl's MCP server directly:

```json
{
  "mcpServers": {
    "crinkl": {
      "url": "https://mcp.crinkl.xyz/mcp"
    }
  }
}
```

## License

MIT
