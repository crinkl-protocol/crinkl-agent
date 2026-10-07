import { describe, it, expect } from "vitest";
import { isDefaultReceiptSubject, isReceiptSubject, matchVendorDomain, senderDomain } from "../src/filters.js";
import { readFileSync } from "node:fs";

const { vendors } = JSON.parse(readFileSync(new URL("../vendors/allowlist.json", import.meta.url), "utf8"));

describe("receipt subject filters", () => {
  it.each(vendors.map((vendor: { domain: string }) => [vendor.domain]))("filters %s", (domain) => {
    expect(isReceiptSubject(domain === "amazon.com" ? "Your package shipped" : "Your receipt", domain)).toBe(true);
    expect(isReceiptSubject("Welcome! Security alert", domain)).toBe(false);
  });

  it.each(["Receipt", "Your invoices", "Payment confirmation", "Order #42", "Purchase confirmation", "Monthly billing statement"])("default accepts %s", (subject) => {
    expect(isDefaultReceiptSubject(subject)).toBe(true);
    expect(isReceiptSubject(subject, "new.example")).toBe(true);
  });

  it("keeps specific filters rather than widening them to the default", () => {
    expect(isReceiptSubject("Your order", "amazon.com")).toBe(false);
    expect(isReceiptSubject("Your payment", "anthropic.com")).toBe(false);
    for (const domain of ["openai.com", "email.openai.com", "stripe.com"]) {
      expect(isReceiptSubject("Your payment", domain)).toBe(true);
      expect(isReceiptSubject("Your purchase", domain)).toBe(false);
    }
  });

  it.each(["paddle.com", "gumroad.com", "suno.com", "gamma.app", "tm1.openai.com"])("uses default receipt words for %s", (domain) => {
    for (const subject of ["Invoice", "Payment", "Your order", "Your purchase", "Billing statement"]) {
      expect(isReceiptSubject(subject, domain)).toBe(true);
    }
  });

  it.each(["Preorder newsletter", "Reordering tips", "Welcome", "Invoiceable services"])("rejects %s", (subject) => {
    expect(isDefaultReceiptSubject(subject)).toBe(false);
  });
});

describe("sender matching", () => {
  const overlapping = ["openai.com", "email.openai.com", "tm1.openai.com"].map((domain) => ({ domain, name: domain }));

  it.each([[overlapping], [[...overlapping].reverse()]])("chooses the most specific domain regardless of list order", (list) => {
    expect(matchVendorDomain("OpenAI <billing@TM1.OPENAI.COM>", list)).toBe("tm1.openai.com");
    expect(matchVendorDomain("billing@sub.tm1.openai.com", list)).toBe("tm1.openai.com");
    expect(matchVendorDomain("billing@email.openai.com", list)).toBe("email.openai.com");
    expect(matchVendorDomain("billing@openai.com", list)).toBe("openai.com");
  });

  it("escapes every dot and requires domain boundaries", () => {
    const list = [{ domain: "tm1.openai.com", name: "OpenAI" }];
    for (const from of ["a@tm1Xopenai.com", "a@tm1.openaiXcom", "a@tm1.openai.com.evil.example", "a@eviltm1.openai.com"]) {
      expect(matchVendorDomain(from, list)).toBeNull();
    }
    expect(matchVendorDomain("a@mail.tm1.openai.com", list)).toBe("tm1.openai.com");
  });

  it("ignores addresses in display names and preserves mail/email alias fallback", () => {
    expect(matchVendorDomain('"billing@openai.com" <a@unknown.example>', overlapping)).toBeNull();
    expect(matchVendorDomain("a@openai.com", [{ domain: "email.openai.com", name: "OpenAI" }])).toBe("email.openai.com");
    expect(senderDomain("Name <a@NEW.EXAMPLE>")).toBe("new.example");
    for (const from of ["no mailbox", "a@bad..example", "a@bad.example, b@other.example", "a@bad.example\nsubject: secret"]) {
      expect(senderDomain(from)).toBeNull();
    }
  });
});
