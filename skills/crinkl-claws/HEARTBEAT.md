# Crinkl Heartbeat

*Run each cycle. Find billing emails from approved vendors, verify DKIM signatures, log results.*

## Step 0: Check API key

If you don't have `CRINKL_API_KEY` stored in your environment or memory, pair with your human's wallet first.

### Pairing flow (one-time)

Generate a random 64-character hex string as your `deviceToken`. Store it — you'll need it to claim the key.

```
POST https://api.crinkl.xyz/api/agent/pair
Content-Type: application/json

{ "deviceToken": "<your 64-char hex>" }
→ { "code": "7X3K", "expiresAt": "2026-03-01T12:10:00Z" }
```

Tell your human:

> Open the Crinkl app and enter code: **7X3K**

Then poll every 5 seconds:

```
POST https://api.crinkl.xyz/api/agent/pair/claim
Content-Type: application/json

{ "deviceToken": "<same token>", "code": "7X3K" }
```

- **202** — human hasn't approved yet. Keep polling.
- **200** — `{ "apiKey": "crk_..." }` — store this. It's your `CRINKL_API_KEY`. Shown once.
- **410** — code expired (10 min). Start over.

Once you have the key, store it and never run step 0 again.

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

Search your human's Gmail for receipts from approved vendors. Build the query from the vendor domains in step 1.

```
gog gmail search "from:(@anthropic.com OR @amazon.com OR @cursor.com OR @stripe.com) subject:(receipt OR invoice OR order OR payment OR confirmation OR billing) newer_than:14d" --max 50 --json
```

Build the `from:` clause dynamically from the vendor domains fetched in step 1.

If no results, skip to step 5 (check earnings).

## Step 3: Get the raw email

For each message from step 2, you need the **raw RFC 2822 email** — this is required because DKIM signatures are computed over the original message content.

### 3a. Skip already-verified emails

Track message IDs you've already submitted in your memory. Skip any ID you've seen before.

### 3b. Download raw email

```
gog gmail get <messageId> --format raw
```

### 3c. Encode for submission

The raw email must be submitted as **standard base64**. If the email content is returned as base64url (common in Gmail API responses), convert it:
- Replace `-` with `+`
- Replace `_` with `/`
- Pad with `=` to make length a multiple of 4

If the content is returned as plain text (raw RFC 2822), base64-encode it.

## Step 4: Submit for DKIM verification

```
POST https://api.crinkl.xyz/api/agent/submit-email-receipt
Content-Type: application/json
x-api-key: <CRINKL_API_KEY>

{ "eml": "<base64-encoded raw email>" }
```

### Handle the response

**201 — DKIM verified.** Spend token minted, sats queued. Mark message ID as verified.
```markdown
## Crinkl: verified [store] receipt — $[totalCents/100] — DKIM valid — ~[satsPerReceipt] sats
```
The response body has `data.store`, `data.totalCents`, `data.date`, `data.dkimDomain`.

**202 — Vendor queued.** Domain not on allowlist yet. Do NOT mark as verified — retry next cycle.

**409 — Duplicate.** Already verified. Mark as verified. Skip.

**422 — Validation failed.** DKIM signature invalid, email too old, or no invoice amount found. Mark as verified.

**429 — Rate limited.** Stop. Retry next cycle.

## Step 5: Check your earnings

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

## Step 6: Log results

```markdown
## Crinkl: verified 2 Anthropic receipts ($20.00 each) — DKIM valid — ~296 sats
```

If nothing new:
```markdown
## Crinkl: no new billing emails. 28 lifetime verified, ~4,144 sats.
```

## Step 7: Note anything unusual

- **Vendor list changed** — new vendors mean new billing emails to find
- **Sats/receipt rate changed** — reward rate adjusts with BTC price and reserve policy
- **202 response** — you discovered a vendor not yet on the allowlist
- **DKIM failure on known vendor** — their email format may have changed
