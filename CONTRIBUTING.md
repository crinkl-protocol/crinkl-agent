# Contributing

Two ways to contribute: **add a vendor** or **add an email provider**.

---

## Add a vendor parser

Each vendor parser extracts structured receipt data from a specific email format. The server does authoritative parsing — local parsers add pre-validation and richer logging.

### 1. Create the parser

```
src/vendors/suno.ts
```

```typescript
import type { VendorParser } from "./types.js";

export const suno: VendorParser = {
  domains: ["suno.com"],
  name: "Suno",
  parse(emailBody, subject) {
    const totalMatch = emailBody.match(/Amount paid\s*\$(\d+\.\d{2})/);
    const dateMatch = emailBody.match(/Date\s+(\w+ \d+, \d{4})/);
    if (!totalMatch) return null;

    return {
      totalCents: Math.round(parseFloat(totalMatch[1]) * 100),
      currency: "USD",
      date: dateMatch ? new Date(dateMatch[1]).toISOString().split("T")[0] : "",
    };
  },
};
```

### 2. Register it

In `src/vendors/registry.ts`:

```typescript
import { suno } from "./suno.js";
import { generic } from "./generic.js";

const parsers: VendorParser[] = [suno, generic];
```

### 3. Open a PR

Include:
- Domain(s) your parser handles
- Example email structure (**redacted** — no real amounts or personal info)
- Edge cases you've seen

### What happens next

Your parser PR gets merged. We add the domain to the server's vendor allowlist. Once both are live, every crinkl-agent user earns Bitcoin from that vendor's receipts.

---

## Add an email provider

Currently Gmail only. To add Outlook, Yahoo, or another provider:

1. Create `src/<provider>.ts` implementing the same interface as `gmail.ts`:
   - `getClient(config)` — authenticate
   - `searchReceiptEmails(client, vendors, maxAgeDays)` — find receipt emails
   - `downloadRawEml(client, messageId)` — download raw `.eml`
   - `getMessageSubject(client, messageId)` — display subject

2. Add a `--provider` flag or auto-detect in `src/index.ts`

3. Include OAuth setup instructions in the PR

---

## Code style

- TypeScript strict mode
- ESM modules (`.js` extensions in imports)
- No runtime deps beyond `googleapis`
- No frameworks, no abstractions for one-time operations

## Non-coders

Want a vendor added but don't code? Open a [Vendor Request](https://github.com/crinkl-protocol/crinkl-agent/issues/new?template=vendor-request.yml).

## Questions

Open an issue or find us at [crinkl.xyz](https://crinkl.xyz).
