import type { Vendor } from "./vendors.js";

export const RECEIPT_KEYWORDS = [
  "receipt", "receipts", "invoice", "invoices", "payment", "payments",
  "order", "orders", "purchase", "purchases", "billing statement",
];

const DEFAULT_SUBJECT_FILTER = /\b(receipts?|invoices?|payments?|orders?|purchases?|billing\s+statement)\b/i;

const SUBJECT_FILTERS: Record<string, RegExp[]> = {
  "amazon.com": [/\bshipped\b/i],
  "anthropic.com": [/\breceipt\b/i, /\binvoice\b/i],
  "openai.com": [/\breceipt\b/i, /\binvoice\b/i, /\bpayment\b/i],
  "email.openai.com": [/\breceipt\b/i, /\binvoice\b/i, /\bpayment\b/i],
  "stripe.com": [/\breceipt\b/i, /\binvoice\b/i, /\bpayment\b/i],
};

export function isDefaultReceiptSubject(subject: string): boolean {
  return DEFAULT_SUBJECT_FILTER.test(subject);
}

export function isReceiptSubject(subject: string, vendorDomain: string): boolean {
  const filters = SUBJECT_FILTERS[vendorDomain.toLowerCase()];
  return filters ? filters.some((filter) => filter.test(subject)) : isDefaultReceiptSubject(subject);
}

/** Read a single mailbox, ignoring display names rather than searching them. */
export function senderDomain(from: string): string | null {
  if (/[\r\n]/.test(from)) return null;
  let address = "";
  let quoted = false;
  let escaped = false;
  let commentDepth = 0;
  let angleStart = -1;
  let angleEnd = -1;
  for (const char of from) {
    if (escaped) {
      if (!commentDepth) address += char;
      escaped = false;
      continue;
    }
    if (char === "\\" && (quoted || commentDepth)) {
      if (!commentDepth) address += char;
      escaped = true;
      continue;
    }
    if (commentDepth) {
      if (char === "(") commentDepth++;
      if (char === ")") commentDepth--;
      continue;
    }
    if (char === '"') quoted = !quoted;
    if (!quoted) {
      if (char === "(") {
        commentDepth = 1;
        address += " ";
        continue;
      }
      if (char === ")" || char === ",") return null;
      if (char === "<") {
        if (angleStart !== -1) return null;
        angleStart = address.length;
      }
      if (char === ">") {
        if (angleStart === -1 || angleEnd !== -1) return null;
        angleEnd = address.length;
      }
    }
    address += char;
  }
  if (quoted || escaped || commentDepth) return null;
  if (angleStart !== -1 && (angleEnd === -1 || address.slice(angleEnd + 1).trim())) return null;
  const mailbox = angleStart === -1 ? address.trim() : address.slice(angleStart + 1, angleEnd);
  const domain = mailbox?.trim().match(/^[^@\s<>]+@([^@\s<>]+)$/)?.[1]?.toLowerCase();
  if (!domain || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(domain)) return null;
  return domain;
}

function matchesDomain(sender: string, domain: string): boolean {
  const escaped = domain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\.)${escaped}$`, "i").test(sender);
}

/** Prefer the longest matching domain, regardless of allowlist order. */
export function matchVendorDomain(from: string, vendors: Vendor[]): string | null {
  const sender = senderDomain(from);
  if (!sender) return null;
  const sorted = [...vendors].sort((a, b) =>
    b.domain.split(".").length - a.domain.split(".").length ||
    b.domain.length - a.domain.length || a.domain.localeCompare(b.domain)
  );
  const exact = sorted.find((vendor) => matchesDomain(sender, vendor.domain));
  if (exact) return exact.domain;
  // Preserve the original mail./email. alias fallback when no direct entry matches.
  return sorted.find((vendor) => matchesDomain(sender, vendor.domain.replace(/^(mail|email)\./i, "")))?.domain ?? null;
}
