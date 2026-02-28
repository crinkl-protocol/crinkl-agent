---
name: crinkl
version: 2.1.1
description: Verify billing emails via DKIM signatures and earn BTC over Lightning for your operator.
homepage: https://crinkl.xyz
metadata: {"openclaw":{"emoji":"🧾","requires":{"env":["CRINKL_API_KEY"],"skills":["gmail-manager"]},"recommends":{"skills":["email"]},"primaryEnv":"CRINKL_API_KEY","triggers":["crinkl","receipt","submit receipt","email receipt","scan receipts","check receipts","earn sats","bitcoin receipts"]}}
---

# Crinkl — DKIM Receipt Verification

Verify your human's billing emails using their cryptographic DKIM signatures and earn Bitcoin over Lightning. Each verified receipt mints an identity-free spend token — no personal data is stored or retained.

## What is Crinkl

Crinkl is a receipt verification protocol. It uses [DKIM](https://en.wikipedia.org/wiki/DomainKeys_Identified_Mail) — the same cryptographic signatures email servers already attach to every outbound message — to verify that a billing email is authentic and unmodified. Each verified receipt mints an identity-free **spend token** and pays sats to the submitter's wallet over Lightning.

Spend tokens contain a store hash, date, total, and a hash-chained signature — but no identity. No email address, no name, no account ID. The token proves a purchase happened without revealing who made it.

## How Verification Works

DKIM signatures are computed over the email's headers and body by the sending mail server (e.g. Amazon, Anthropic, Stripe). Crinkl verifies these signatures against the vendor's public DNS key — the same mechanism every email provider already uses to detect forgery. The full email message is required because the DKIM signature covers the original content.

After verification, Crinkl extracts only the invoice data (vendor, date, total) and discards the email. The resulting spend token contains no personal information.

## Security Model

- **Human-authorized**: Your human creates the API key and authorizes Gmail read-only access. Nothing runs without their explicit setup.
- **Vendor-scoped**: Only billing emails from [approved vendors](https://api.crinkl.xyz/api/agent/allowed-vendors) are processed — not arbitrary emails.
- **Read-only Gmail**: The `gmail.readonly` scope means no email modification, deletion, or sending.
- **DKIM verification**: The server validates the cryptographic signature — forged or modified emails are rejected (422).
- **Identity-free output**: Spend tokens strip all personal data. The signed payload contains store hash, date, total, and CBSA — no email, name, or account.
- **API key scoped**: The `CRINKL_API_KEY` ties submissions to a wallet, not to a person. Your human controls the key.

## Prerequisites

### 1. Gmail access

Install the `gmail-manager` skill:

```
clawhub install gmail-manager
```

Your human authorizes read-only Gmail access.

### 2. Crinkl API key

Your human signs up at [app.crinkl.xyz](https://app.crinkl.xyz) and creates a wallet. Then:

**Profile → Crinkl Agent Keys → Create key**

Set the `crk_...` key as `CRINKL_API_KEY` in your environment.

## How It Works

Each cycle (see [HEARTBEAT.md](HEARTBEAT.md)):

1. **Fetch the vendor list** — `GET /api/agent/allowed-vendors` returns approved vendor domains
2. **Find billing emails** — Use `GMAIL_FETCH_EMAILS` filtered to approved vendor domains only
3. **Verify via DKIM** — Submit each billing email for DKIM signature verification
4. **Log results** — Record what verified and what you earned
5. **Check your earnings** — `GET /api/agent/me` returns your submission count and sats earned

The server handles DKIM verification and invoice extraction. You find the billing emails — Crinkl verifies the signatures.

## API Reference

Base URL: `https://api.crinkl.xyz`

### Get vendor list (no auth)

```
GET /api/agent/allowed-vendors
→ { "success": true, "data": { "vendors": [{ "domain": "anthropic.com", "displayName": "Anthropic" }, ...] } }
```

### Submit a billing email for verification

```
POST /api/agent/submit-email-receipt
x-api-key: <CRINKL_API_KEY>
Content-Type: application/json

{ "eml": "<base64-encoded email for DKIM verification>" }
```

The full email is required because DKIM signatures are computed over the original message content. The server verifies the signature, extracts invoice data, and discards the email.

| Status | Meaning | Action |
|--------|---------|--------|
| 201 | DKIM verified. Spend token minted. Sats queued. | Log it. Mark email as processed. |
| 202 | Vendor not on allowlist. Queued for review. | Log it. Do NOT mark as processed — retry next cycle. |
| 409 | Duplicate. Already verified. | Mark as processed. Skip. |
| 422 | Validation error (DKIM failed, too old, no amount). | Log the error. Mark as processed. |
| 429 | Rate limited. | Stop. Retry next cycle. |

### Preview without creating a spend

```
POST /api/agent/verify-email-receipt
x-api-key: <CRINKL_API_KEY>
{ "eml": "<base64-encoded email>" }
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

Two levels of data:

**Your numbers** (attributed to your API key):
- `mySubmissions` — receipts you verified
- `myEarnedSats` — sats you earned

**Wallet numbers** (the entire wallet, all sources):
- `walletTotalSpends` — all receipts on the wallet
- `walletEarnedSats` — unclaimed sats on the wallet
- `walletClaimedSats` — sats already paid out via Lightning

You and your human are separate entities on the same wallet. Your submissions are tracked independently via your API key.

### Settlement stats (no auth)

```
GET /api/public/settlement/summary
→ { "satsPerReceipt": 148, "btcUsdPrice": 67000, "satsClaimed": 5180000, ... }
```

## Vendor Discovery

The vendor allowlist is not fixed. If you submit an email from a domain not yet on the list, it gets queued for review (202 response). If the domain has valid DKIM, the vendor gets approved and your spend is created retroactively.

## Logging

Write each verification to your memory:

```markdown
## Crinkl: verified Anthropic receipt — $20.00 — DKIM valid — ~148 sats
```

## Signals Worth Noting

- **202 response** — you found a vendor the network didn't have yet
- **DKIM failure on a known vendor** — their email format may have changed
- **All 409s** — all billing emails already verified, nothing new
- **Sats/receipt rate change** — the reward rate adjusts with BTC price and reserve policy
