---
name: crinkl-claws
version: 1.0.1
description: Verify billing emails via DKIM signatures and earn BTC over Lightning for your operator.
homepage: https://crinkl.xyz
metadata: {"openclaw":{"emoji":"🧾","recommends":{"skills":["gog"]},"triggers":["crinkl","receipt","submit receipt","email receipt","scan receipts","check receipts","earn sats","bitcoin receipts"]}}
---

# Crinkl — DKIM Receipt Verification

Verify your human's billing emails using their cryptographic DKIM signatures and earn Bitcoin over Lightning. Each verified receipt mints an identity-free spend token — no personal data is stored or retained.

## What is Crinkl

Crinkl is a receipt verification protocol. It uses [DKIM](https://en.wikipedia.org/wiki/DomainKeys_Identified_Mail) — the same cryptographic signatures email servers already attach to every outbound message — to verify that a billing email is authentic and unmodified. Each verified receipt mints an identity-free **spend token** and pays sats to the submitter's wallet over Lightning.

Spend tokens contain a store hash, date, total, and a hash-chained signature — but no identity. No email address, no name, no account ID. The token proves a purchase happened without revealing who made it.

## Privacy & Data Handling

This skill sends **individual billing emails** to `api.crinkl.xyz` for DKIM signature verification. This section explains exactly what is sent, why, and what happens to it.

### Why the full email is required

DKIM signatures are computed over the email's headers and body by the sending mail server (e.g. Amazon SES, Google Workspace). The signature covers the **original message content** — not a summary, not extracted fields, but the actual RFC 2822 message. To verify the cryptographic signature, the server must receive the same bytes the mail server signed. There is no way to verify DKIM without the original message.

This is the same verification that Gmail, Outlook, and every email provider performs when checking if an email is forged. The difference is that Crinkl uses the verification result to prove a purchase happened.

### What happens after verification

1. The server checks the DKIM signature against the vendor's public DNS key
2. If valid, it extracts **only**: vendor name, invoice date, total amount, currency
3. The original email is **discarded** — not stored, not logged, not retained
4. A spend token is minted containing only the extracted invoice data (no email content, no personal data)

### Scope

This skill only searches for billing emails from [approved vendor domains](https://api.crinkl.xyz/api/agent/allowed-vendors), filtered by billing keywords, from the last 14 days.

## Security Model

- **Human-authorized**: Your human approves the pairing code in their app. Nothing runs without their explicit consent.
- **Vendor-scoped**: Only billing emails from [approved vendors](https://api.crinkl.xyz/api/agent/allowed-vendors) are processed — not arbitrary emails.
- **Read-only Gmail**: The `gmail.readonly` scope means no email modification, deletion, or sending.
- **DKIM verification**: The server validates the cryptographic signature — forged or modified emails are rejected (422).
- **Identity-free output**: Spend tokens strip all personal data. The signed payload contains store hash, date, total, and CBSA — no email, name, or account.
- **API key scoped**: The API key ties submissions to a wallet, not to a person. Your human controls the key and can revoke it anytime.
- **Open source**: The server-side verification logic is documented in the [crinkl-protocol spec](https://github.com/crinkl-protocol/crinkl-protocol). The agent source is at [crinkl-agent](https://github.com/crinkl-protocol/crinkl-agent) (MIT license).

## Setup

### 1. Pair with your human's Crinkl wallet

On first run, pair with your human's wallet using a 4-character code:

```
POST https://api.crinkl.xyz/api/agent/pair
Content-Type: application/json

{ "deviceToken": "<generate a random 64-char hex string>" }
→ { "code": "7X3K", "expiresAt": "2026-03-01T12:10:00Z" }
```

Tell your human:

> **Open the Crinkl app and enter code: 7X3K**

Your human opens [app.crinkl.xyz](https://app.crinkl.xyz) (they're already logged in), goes to the Pair Agent screen, and types the 4-character code. That's it.

Then poll for your key:

```
POST https://api.crinkl.xyz/api/agent/pair/claim
Content-Type: application/json

{ "deviceToken": "<same token>", "code": "7X3K" }
→ 202 while pending
→ 200 { "apiKey": "crk_..." } once human approves
```

Poll every 5 seconds. The code expires in 10 minutes. Store the key securely — it's shown once.

### 2. Gmail access

Install the **gog** skill for Gmail access:

```
clawhub install gog
```

Your human authorizes read-only Gmail access through gog's OAuth setup.

## How It Works

Each cycle (see [HEARTBEAT.md](HEARTBEAT.md)):

1. **Check API key** — pair if needed (one-time)
2. **Fetch the vendor list** — `GET /api/agent/allowed-vendors` returns approved vendor domains
3. **Find billing emails** — Search Gmail for receipts from approved vendors only
4. **Get raw email** — Download each billing email in raw format (required for DKIM signature verification)
5. **Submit for verification** — POST to Crinkl for DKIM verification; email is discarded after extraction
6. **Log results** — Record what verified and what you earned
7. **Check your earnings** — `GET /api/agent/me` returns your submission count and sats earned

## API Reference

Base URL: `https://api.crinkl.xyz`

### Pair with a wallet (no auth)

```
POST /api/agent/pair
{ "deviceToken": "<64-char hex>" }
→ { "code": "7X3K", "expiresAt": "..." }

POST /api/agent/pair/claim
{ "deviceToken": "<same>", "code": "7X3K" }
→ 202 (pending) | 200 { "apiKey": "crk_..." }
```

### Get vendor list (no auth)

```
GET /api/agent/allowed-vendors
→ { "success": true, "data": { "vendors": [{ "domain": "anthropic.com", "displayName": "Anthropic" }, ...] } }
```

### Submit a billing email for DKIM verification

```
POST /api/agent/submit-email-receipt
x-api-key: <CRINKL_API_KEY>
Content-Type: application/json

{ "eml": "<base64-encoded raw email>" }
```

The full email is required for DKIM signature verification (see [Privacy & Data Handling](#privacy--data-handling) above). After verification, only invoice data is extracted and the email is discarded.

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
