# Contributing

Two ways to contribute: **add a vendor** or **add an email provider**.

---

## Add a vendor

Submit the unknown vendor's DKIM-signed billing email through the Crinkl API
(`POST /api/agent/submit-email-receipt`). It enters the server review queue;
Crinkl reviews and approves the vendor. Approval adds the domain to the
allowlist and processes the queued spend retroactively. Submitting an email
does not guarantee approval. AgentMail scans can submit unknown senders;
Gmail submission scans currently search only allowed vendors.

Use `npm run dev -- --discover` (or add `--agentmail`) to see unsupported
receipt senders to request. It reports domains and counts without sending
emails to the verification or submission routes. Add `--json` for JSON output.

The manual alternative is a [Vendor Request](https://github.com/crinkl-protocol/crinkl-agent/issues/new?template=vendor-request.yml) with:

- Vendor name and billing domain
- Whether they send DKIM-signed billing emails
- Any notes on email format

---

## Add an email provider

Gmail and AgentMail use the same processing loop. To add Outlook, Yahoo, or another provider:

1. Create `src/<provider>.ts` implementing `EmailSource` from `src/pipeline.ts`:
   - `listMessages()` — message IDs within the configured age window
   - `getMetadata(messageId)` — separate subject and real From header
   - `downloadRawEml(messageId)` — download raw `.eml` in memory
   - In discovery mode, list all receipt-like subjects without an allowlist restriction and include all pages.

2. Add a flag in `src/index.ts` and select the source in `src/cli.ts`.

3. Include authentication setup instructions and fake-source tests in the PR.

---

## Code style

- TypeScript strict mode
- ESM modules (`.js` extensions in imports)
- No runtime deps beyond `googleapis`
- No frameworks, no abstractions for one-time operations

## Questions

Open an issue or find us at [crinkl.xyz](https://crinkl.xyz).
