---
name: crinkl
version: 2.0.1
description: Scan Gmail for billing receipts, submit to Crinkl, earn BTC over Lightning.
homepage: https://crinkl.xyz
metadata: {"openclaw":{"emoji":"🧾","requires":{"env":["CRINKL_API_KEY"],"skills":["gmail-manager"]},"recommends":{"skills":["email"]},"primaryEnv":"CRINKL_API_KEY","triggers":["crinkl","receipt","submit receipt","email receipt","scan receipts","check receipts","earn sats","bitcoin receipts"]}}
---

# Crinkl — Scan & Submit Email Receipts

## What is Crinkl

Crinkl is a receipt verification protocol. Humans and agents submit receipts — email billing confirmations or photos of physical receipts — and Crinkl verifies them cryptographically. Each verified receipt mints an identity-free **spend token** and pays the submitter in Bitcoin over Lightning.

Spend tokens are the protocol's atomic unit. They contain a store hash, date, total, CBSA code, and a hash-chained signature — but no identity. No email, no name, no account. The token proves a purchase happened without revealing who made it.

## What This Skill Does

This skill makes you a receipt-scanning agent. You scan your human's Gmail for billing emails from approved vendors, download the raw emails, and submit them to Crinkl's verification API. The server checks the DKIM signature (cryptographic proof the email is authentic and unmodified), extracts the invoice data, mints a spend token, and queues sats to the wallet.

You earn Bitcoin for your human operator every time a receipt verifies.

## Prerequisites

### 1. Gmail access

Install the `gmail-manager` skill:

```
clawhub install gmail-manager
```

Your human authorizes Gmail access (read-only is sufficient).

### 2. Crinkl API key

Your human signs up at [app.crinkl.xyz](https://app.crinkl.xyz) and creates a wallet. Then:

**Profile → Crinkl Agent Keys → Create key**

Set the `crk_...` key as `CRINKL_API_KEY` in your environment. This key ties your submissions to your human's wallet and tracks your earnings separately from theirs.

## How It Works

Each cycle (see [HEARTBEAT.md](HEARTBEAT.md)):

1. **Fetch the vendor list** — `GET /api/agent/allowed-vendors` returns the domains Crinkl currently accepts (Anthropic, Amazon, Cursor, Stripe, etc.)
2. **Search Gmail** — Use `GMAIL_FETCH_EMAILS` with vendor domains as sender filters to find billing emails
3. **Download each email** — `GMAIL_GET_EMAIL_BY_ID` with `format: raw` gets the full RFC 2822 message
4. **Submit to Crinkl** — `POST /api/agent/submit-email-receipt` with the base64-encoded .eml
5. **Log results** — Record what you submitted, what verified, what earned
6. **Check your earnings** — `GET /api/agent/me` returns your submission count and sats earned

The server handles all verification and data extraction. You send raw emails — Crinkl does the rest.

## API Reference

Base URL: `https://api.crinkl.xyz`

### Get vendor list (no auth)

```
GET /api/agent/allowed-vendors
→ { "success": true, "data": { "vendors": [{ "domain": "anthropic.com", "displayName": "Anthropic" }, ...] } }
```

### Submit an email receipt

```
POST /api/agent/submit-email-receipt
x-api-key: <CRINKL_API_KEY>
Content-Type: application/json

{ "eml": "<base64-encoded raw email>" }
```

| Status | Meaning | Action |
|--------|---------|--------|
| 201 | Verified. Spend token minted. Sats queued. | Log it. Mark email as submitted. |
| 202 | Vendor not on allowlist. Queued for review. | Log it. Do NOT mark as submitted — retry next heartbeat. |
| 409 | Duplicate. Already submitted. | Mark as submitted. Skip. |
| 422 | Validation error (DKIM failed, too old, no amount). | Log the error. Mark as submitted. |
| 429 | Rate limited. | Stop submitting. Retry next heartbeat. |

### Preview without submitting

```
POST /api/agent/verify-email-receipt
x-api-key: <CRINKL_API_KEY>
{ "eml": "<base64-encoded raw email>" }
→ 200 with extracted data (no spend created)
```

### Get spend token

```
GET /api/agent/spends/:spendId/token/latest
x-api-key: <CRINKL_API_KEY>
→ signed spend attestation token
```

### Your identity and earnings

```
GET /api/agent/me
x-api-key: <CRINKL_API_KEY>
→ {
    "walletUsername": "...",
    "mySubmissions": 12,
    "myEarnedSats": 1836,
    "walletTotalSpends": 45,
    "walletEarnedSats": 5000,
    "walletClaimedSats": 12000,
    "satsPerReceipt": 153
  }
```

This endpoint returns two levels of data:

**Your numbers** (attributed to your API key):
- `mySubmissions` — receipts you submitted
- `myEarnedSats` — sats you earned

**Wallet numbers** (the entire wallet, all sources):
- `walletTotalSpends` — all receipts on the wallet (camera + all agents)
- `walletEarnedSats` — unclaimed sats on the wallet
- `walletClaimedSats` — sats already paid out via Lightning

You and your human are separate entities on the same wallet. Your human also submits receipts by scanning physical receipts with their phone camera. Your submissions are tracked independently via your API key.

### Settlement stats (no auth)

```
GET /api/public/settlement/summary
→ { "satsPerReceipt": 148, "btcUsdPrice": 67000, "satsClaimed": 5180000, ... }
```

## Vendor Discovery

The vendor allowlist is not fixed. If you submit an email from a domain not yet on the list, it gets **queued for review** (202 response), not rejected. If the domain has valid DKIM, the vendor gets approved and your spend is created retroactively.

Every new vendor you discover expands the network. Submit emails from any vendor your human uses — the worst that happens is a 202 queue.

## Logging

Write each submission to your memory so you have a record of what you did.

```markdown
## Crinkl: submitted Anthropic receipt — $20.00 — 201 verified — ~148 sats
```

## Signals Worth Noting

- **202 response** — you found a vendor the network didn't have yet
- **DKIM failure on a known vendor** — their email format may have changed
- **All 409s** — inbox fully scanned, no new receipts to submit
- **Unusual amount** — very large or very small receipt
- **Sats/receipt rate change** — the reward rate adjusts with BTC price and reserve policy

## Privacy

- Only individual email content is sent to Crinkl. No inbox credentials are shared.
- Spend tokens are identity-free — no email address, name, or account ID in the signed payload.
- The API key ties submissions to a wallet, not to a person.
- Gmail access is read-only (`gmail.readonly` scope).
