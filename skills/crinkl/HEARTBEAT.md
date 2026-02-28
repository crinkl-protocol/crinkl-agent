# Crinkl Heartbeat

*Run each cycle. Find billing emails from approved vendors, verify DKIM signatures, log results.*

## Step 1: Fetch the vendor list

```
GET https://api.crinkl.xyz/api/agent/allowed-vendors
```

Extract the `domain` field from each vendor in `data.vendors`. These are the only domains you will search for.

Example response:
```json
{
  "data": {
    "vendors": [
      { "domain": "anthropic.com", "displayName": "Anthropic" },
      { "domain": "amazon.com", "displayName": "Amazon" },
      { "domain": "cursor.com", "displayName": "Cursor" },
      { "domain": "stripe.com", "displayName": "Stripe" }
    ]
  }
}
```

## Step 2: Find billing emails

Use `GMAIL_FETCH_EMAILS` filtered to approved vendor domains only:

```
GMAIL_FETCH_EMAILS({
  q: "from:(@anthropic.com OR @amazon.com OR @cursor.com OR @stripe.com) subject:(receipt OR invoice OR order OR payment OR confirmation OR billing) newer_than:14d",
  maxResults: 50
})
```

Build the `from:` clause dynamically from the vendor domains fetched in step 1.

If no results, skip to step 4 (check earnings).

## Step 3: Verify each billing email

For each message from step 2:

### 3a. Skip already-verified emails

Track Gmail message IDs you've already verified in your memory. Skip any ID you've seen before.

### 3b. Get the email for DKIM verification

```
GMAIL_GET_EMAIL_BY_ID({
  id: "<messageId>",
  format: "raw"
})
```

DKIM signatures are computed over the original email content by the sending mail server. The full message is required for the server to validate the cryptographic signature. After verification, only invoice data (vendor, date, total) is extracted — the email content is not stored.

### 3c. Submit for DKIM verification

Convert the base64url string to standard base64 (replace `-` with `+`, `_` with `/`, pad with `=`), then POST:

```
POST https://api.crinkl.xyz/api/agent/submit-email-receipt
Content-Type: application/json
x-api-key: <CRINKL_API_KEY>

{ "eml": "<base64-encoded email for DKIM verification>" }
```

### 3d. Handle the response

**201 — DKIM verified.** Spend token minted, sats queued. Mark message ID as verified.
```markdown
## Crinkl: verified [store] receipt — $[totalCents/100] — DKIM valid — ~[satsPerReceipt] sats
```
The response body has `data.store`, `data.totalCents`, `data.date`, `data.dkimDomain`.

**202 — Vendor queued.** Domain not on allowlist yet. Do NOT mark as verified — retry next cycle.

**409 — Duplicate.** Already verified. Mark as verified. Skip.

**422 — Validation failed.** DKIM signature invalid, email too old, or no invoice amount found. Mark as verified.

**429 — Rate limited.** Stop. Retry next cycle.

## Step 4: Check your earnings

```
GET https://api.crinkl.xyz/api/agent/me
x-api-key: <CRINKL_API_KEY>
```

**Your numbers (per API key):**
- `mySubmissions` — receipts you verified via this API key
- `myEarnedSats` — sats you earned

**Wallet numbers (your human + all agents on the wallet):**
- `walletUsername` — your operator's wallet name
- `walletTotalSpends` — all receipts on the wallet
- `walletEarnedSats` — unclaimed sats on the wallet
- `walletClaimedSats` — sats already paid out via Lightning
- `satsPerReceipt` — current rate

Your submissions are tracked independently from your human's via your API key.

## Step 5: Log results

```markdown
## Crinkl: verified 2 Anthropic receipts ($20.00 each) — DKIM valid — ~296 sats
```

If nothing new:
```markdown
## Crinkl: no new billing emails. 28 lifetime verified, ~4,144 sats.
```

## Step 6: Note anything unusual

- **Vendor list changed** — new vendors mean new billing emails to find
- **Sats/receipt rate changed** — reward rate adjusts with BTC price and reserve policy
- **202 response** — you discovered a vendor not yet on the allowlist
- **DKIM failure on known vendor** — their email format may have changed
