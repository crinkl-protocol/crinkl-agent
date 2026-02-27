---
name: crinkl
version: 1.0.0
description: Submit email receipts to Crinkl. Verify DKIM signatures. Earn BTC over Lightning.
homepage: https://crinkl.xyz
metadata: {"openclaw":{"emoji":"🧾","requires":{"env":["CRINKL_API_KEY"]},"primaryEnv":"CRINKL_API_KEY"}}
---

# Crinkl — Email Receipt Submission

Submit your human's DKIM-signed billing emails to Crinkl and earn Bitcoin over Lightning. Each verified receipt mints an identity-free spend token and routes sats to the wallet.

## What This Does

Your human has billing emails from SaaS vendors (Cursor, Vercel, OpenAI, Anthropic, Stripe, etc.) sitting in Gmail. Each one has a DKIM signature from the vendor's mail server — a cryptographic proof the email is real and unmodified.

This skill lets you submit those emails to Crinkl's verification API. The server verifies the DKIM signature, extracts invoice data, and mints a spend token. The wallet earns ~147 sats per verified receipt at current BTC prices.

## Setup

### 1. Your human gets a Crinkl API key

Sign up at [app.crinkl.xyz](https://app.crinkl.xyz) (it's a PWA, works in any browser). Once they have a wallet:

**Settings → Agent API Keys → Generate**

This gives a `crk_...` key tied to their wallet. Set it as `CRINKL_API_KEY` in your environment.

### 2. (Optional) Run the reference agent

If your human wants a standalone CLI that scans Gmail automatically:

```bash
npx crinkl-agent
```

Or clone: [github.com/crinkl-protocol/crinkl-agent](https://github.com/crinkl-protocol/crinkl-agent)

## API Reference

Base URL: `https://api.crinkl.xyz`

### Check supported vendors (no auth)

```
GET /api/agent/allowed-vendors
```

Returns list of approved vendor domains. Vendors must send DKIM-signed billing emails.

### Submit an email receipt

```
POST /api/agent/submit-email-receipt
Header: x-api-key: <CRINKL_API_KEY>
Body: { "eml": "<base64-encoded .eml file>" }
```

**Response codes:**
- `201` — Spend created. Token minted. Sats queued.
- `202` — Vendor not yet approved. Submission queued for review (not rejected — will process if approved).
- `409` — Duplicate. Already submitted.
- `422` — Validation error (DKIM failed, no amount extracted, too old).
- `429` — Daily limit reached.

### Preview without submitting

```
POST /api/agent/verify-email-receipt
Header: x-api-key: <CRINKL_API_KEY>
Body: { "eml": "<base64-encoded .eml file>" }
```

Returns 200 with extracted data. No spend created.

### Get spend token

```
GET /api/agent/spends/:spendId/token/latest
Header: x-api-key: <CRINKL_API_KEY>
```

Returns the signed spend attestation token.

## How To Submit

1. Your human provides a raw `.eml` file (exported from their email client, or retrieved via a separately authorized Gmail/IMAP tool). Do NOT autonomously access email accounts — the human must explicitly provide or authorize access to their mailbox.
2. Base64-encode the `.eml` content
3. POST to `/api/agent/submit-email-receipt` with your API key
4. Handle the response code

The server does all verification and data extraction. You're just a pipe from inbox to API. You do not need mailbox credentials — only the `.eml` file and a `CRINKL_API_KEY`.

## Unknown Vendors

If you submit an email from a vendor not on the allowlist, it's **queued for review** (202), not rejected. If the domain has valid DKIM, the vendor will be approved and the spend created retroactively.

Want to add a vendor? Just submit an email from them.

## What Earns Sats

Any DKIM-signed billing email from a supported vendor:
- SaaS subscriptions (Cursor, Vercel, OpenAI, Anthropic, GitHub, etc.)
- Billing through Stripe, Paddle, Gumroad
- Any vendor that sends DKIM-signed email receipts

Physical receipts are submitted through the [PWA camera](https://app.crinkl.xyz), not this API.

## Privacy

- Only individual `.eml` files leave the machine. No inbox access shared.
- Spend tokens are identity-free — no email, no name, no account ID in the signed payload.
- The API key ties receipts to a wallet, not to a person.
