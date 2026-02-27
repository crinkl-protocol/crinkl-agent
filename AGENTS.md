# AGENTS.md

Machine-readable instructions for AI agents interacting with this repository.

## What this repo is

`crinkl-agent` is an open-source CLI tool that earns Bitcoin from email receipts. It scans Gmail for DKIM-signed billing emails, submits them to the Crinkl protocol for cryptographic attestation, and the user receives sats over Lightning.

**Repository**: `crinkl-protocol/crinkl-agent`
**Language**: TypeScript (strict, ESM)
**Runtime**: Node >= 20
**License**: MIT

## If you are an MCP-capable agent

Skip this repo. Add the Crinkl MCP server directly:

```json
{
  "mcpServers": {
    "crinkl": {
      "url": "https://mcp.crinkl.xyz/mcp"
    }
  }
}
```

Available tools:
- `submit-email-receipt` — submit a base64-encoded `.eml` file for DKIM verification and rewards
- `verify-email-receipt` — preview DKIM verification without submitting
- `allowed-vendors` — list currently approved vendor domains

You need a Crinkl API key (`x-api-key` header). The user generates one at `https://app.crinkl.xyz/profile/agent-keys`.

## If you are helping a user run this agent

### Setup

1. User needs a Crinkl API key from `https://app.crinkl.xyz/profile/agent-keys`
2. User needs Google OAuth credentials (Desktop app type) from `https://console.cloud.google.com/apis/credentials` with Gmail API enabled
3. Create `.env` from `.env.example` with both credentials
4. Run: `npx crinkl-agent`

### Commands

```
crinkl-agent            # scan Gmail + submit receipts
crinkl-agent --scan     # dry run (preview only)
crinkl-agent --auth     # set up Gmail OAuth only
crinkl-agent --help     # usage
```

### Data flow

```
Gmail (readonly) → crinkl-agent (local) → api.crinkl.xyz (DKIM verify + attest) → ₿ sats
```

Only individual `.eml` files leave the user's machine. No inbox access is shared.

## If you are contributing code

### Architecture

```
src/
├── index.ts              # CLI entry point
├── config.ts             # .env loader, Config type
├── gmail.ts              # Gmail OAuth + search/download
├── crinkl.ts             # Crinkl API client (verify, submit, vendors)
└── vendors/
    ├── types.ts           # VendorParser interface (the contribution contract)
    ├── registry.ts        # Parser lookup by domain
    └── generic.ts         # Fallback (returns null, server parses)
```

### How to add a vendor parser

This is the primary contribution path. Each parser extracts structured receipt data from a specific vendor's email format.

**Step 1**: Create `src/vendors/<vendor>.ts`

```typescript
import type { VendorParser } from "./types.js";

export const vendorName: VendorParser = {
  // Domains that appear in the From header of this vendor's emails
  domains: ["billing.vendor.com", "vendor.com"],
  name: "Vendor Name",
  parse(emailBody: string, subject: string) {
    // Extract total, date, and optionally invoice ID + line items
    // Return null if the email doesn't match expected format
    // The server does authoritative parsing — this is for pre-validation
    const totalMatch = emailBody.match(/Total:\s*\$(\d+\.\d{2})/);
    if (!totalMatch) return null;
    return {
      totalCents: Math.round(parseFloat(totalMatch[1]) * 100),
      currency: "USD",
      date: "2026-01-15",
    };
  },
};
```

**Step 2**: Register in `src/vendors/registry.ts`

```typescript
import { vendorName } from "./vendorName.js";
// Add to the parsers array before generic
const parsers: VendorParser[] = [vendorName, generic];
```

**Step 3**: Add a test in `test/vendors/<vendor>.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { vendorName } from "../../src/vendors/vendorName.js";

describe("vendorName parser", () => {
  it("extracts total and date from billing email", () => {
    const body = `... redacted sample email body ...`;
    const result = vendorName.parse(body, "Your receipt");
    expect(result).not.toBeNull();
    expect(result!.totalCents).toBe(999);
    expect(result!.currency).toBe("USD");
  });

  it("returns null for non-receipt emails", () => {
    expect(vendorName.parse("Welcome to Vendor!", "Welcome")).toBeNull();
  });
});
```

**Step 4**: Verify

```bash
npm test        # run all tests
npm run lint    # type check
```

**Step 5**: Open a PR with:
- The domain(s) handled
- Example email structure (redacted — no real amounts or personal info)
- Edge cases

After merge, we add the domain to the server allowlist. Then every agent user earns from that vendor.

### The VendorParser contract

```typescript
interface ParsedReceipt {
  totalCents: number;      // required — amount in cents
  currency: string;        // required — ISO currency code
  date: string;            // required — ISO date (YYYY-MM-DD)
  invoiceId?: string;      // optional
  lineItems?: Array<{      // optional
    description: string;
    amountCents: number;
  }>;
}

interface VendorParser {
  domains: string[];       // email From domains this parser handles
  name: string;            // display name
  parse(emailBody: string, subject: string): ParsedReceipt | null;
}
```

**Rules**:
- Return `null` if the email doesn't match. Never throw.
- `totalCents` must be a positive integer (cents, not dollars).
- `date` must be ISO format: `YYYY-MM-DD`.
- The server does authoritative parsing. Local parsers are for pre-validation and logging.

### How to add an email provider

Currently Gmail only. To add Outlook, Yahoo, etc:

1. Create `src/<provider>.ts` implementing the same interface as `gmail.ts`:
   - `getClient(config)` — authenticate
   - `searchReceiptEmails(client, vendors, maxAgeDays)` — find receipt emails
   - `downloadRawEml(client, messageId)` — get raw `.eml` content
   - `getMessageSubject(client, messageId)` — display subject
2. Add `--provider <name>` flag in `src/index.ts`
3. Include OAuth setup instructions

### Commands for development

```bash
npm install          # install deps
npm test             # run vitest
npm run lint         # tsc --noEmit
npm run build        # compile to dist/
npm run dev          # run from source via tsx
```

### Code conventions

- TypeScript strict mode, ESM modules
- `.js` extensions in all imports (Node ESM resolution)
- No runtime dependencies beyond `googleapis`
- No frameworks, no abstractions for one-time operations
- Tests go in `test/` mirroring `src/` structure

## API reference

### Public (no auth)

- `GET https://api.crinkl.xyz/api/agent/allowed-vendors` — list approved vendor domains

### Authenticated (x-api-key header)

- `POST https://api.crinkl.xyz/api/agent/verify-email-receipt` — verify DKIM without submitting
  - Body: `{ "eml": "<base64-encoded .eml>" }`
- `POST https://api.crinkl.xyz/api/agent/submit-email-receipt` — verify + submit for rewards
  - Body: `{ "eml": "<base64-encoded .eml>" }`

### MCP

- Endpoint: `https://mcp.crinkl.xyz/mcp`
- Tools: `submit-email-receipt`, `verify-email-receipt`, `allowed-vendors`

## Currently allowed vendors

Fetched live from the API. As of last update:

- `gumroad.com` — Gumroad
- `paddle.com` — Paddle
- `stripe.com` — Stripe
- `suno.com` — Suno

Check `https://api.crinkl.xyz/api/agent/allowed-vendors` for the current list.
