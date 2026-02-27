# Contributing to crinkl-agent

Thanks for your interest in contributing! There are two main ways to help:

## 1. Add a vendor parser

Vendor parsers extract structured receipt data from specific email formats. The server does authoritative parsing, but local parsers enable pre-validation and richer logging.

### Steps

1. Fork this repo
2. Create `src/vendors/<vendor>.ts`:

```typescript
import type { VendorParser } from "./types.js";

export const myVendor: VendorParser = {
  domains: ["vendor.com", "billing.vendor.com"],
  name: "My Vendor",
  parse(emailBody, subject) {
    // Extract receipt data from the email body HTML/text
    const totalMatch = emailBody.match(/Total:\s*\$(\d+\.\d{2})/);
    if (!totalMatch) return null;

    return {
      totalCents: Math.round(parseFloat(totalMatch[1]) * 100),
      currency: "USD",
      date: "2026-01-15", // extract from email
    };
  },
};
```

3. Register it in `src/vendors/registry.ts`:

```typescript
import { myVendor } from "./myVendor.js";

const parsers: VendorParser[] = [myVendor, generic];
```

4. Open a PR with:
   - The domain(s) your parser handles
   - Example email structure (redacted — no real amounts or personal info)
   - Any edge cases you've seen

### How the allowlist works

Your parser PR gets merged, then we add the domain to the server's vendor allowlist. Once both are live, anyone running the agent earns from that vendor's receipts.

## 2. Add an email provider

Currently only Gmail is supported. To add another provider (Outlook, Yahoo, etc.):

1. Create `src/<provider>.ts` implementing the same interface:
   - `getClient(config)` — authenticate
   - `searchReceiptEmails(client, vendors, maxAgeDays)` — search for receipt emails
   - `downloadRawEml(client, messageId)` — download raw `.eml`
   - `getMessageSubject(client, messageId)` — get display subject

2. Add a `--provider` flag or auto-detect in `src/index.ts`

3. Open a PR with setup instructions for that provider's OAuth flow

## Code style

- TypeScript strict mode
- ESM modules (`.js` extensions in imports)
- No runtime dependencies beyond `googleapis`
- Keep it simple — no frameworks, no abstractions for one-time operations

## Requesting vendor support (non-coders)

If you don't code but want a vendor added, open a [Vendor Request issue](https://github.com/crinkl-protocol/crinkl-agent/issues/new?template=vendor-request.yml).

## Questions?

Open an issue or reach out at [crinkl.xyz](https://crinkl.xyz).
