# Contributing

Two ways to contribute: **add a vendor** or **add an email provider**.

---

## Add a vendor

The simplest way: just submit a billing email from the vendor. If the domain has valid DKIM, it enters a review queue and gets approved.

Want it added proactively? Open a [Vendor Request](https://github.com/crinkl-protocol/crinkl-agent/issues/new?template=vendor-request.yml) with:
- Vendor name and billing domain
- Whether they send DKIM-signed billing emails
- Any notes on email format

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

## Questions

Open an issue or find us at [crinkl.xyz](https://crinkl.xyz).
