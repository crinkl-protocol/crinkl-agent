/**
 * Template for vendor parser tests.
 *
 * Copy this file to test/vendors/<vendor>.test.ts and fill in:
 * 1. The import path to your parser
 * 2. A sample email body (redacted — no real amounts or personal info)
 * 3. Expected parse results
 *
 * Run: npm test
 */

import { describe, it, expect } from "vitest";
// import { myVendor } from "../../src/vendors/myVendor.js";

describe.skip("myVendor parser", () => {
  // Sample email body — redact all real amounts and personal info.
  // Paste the general HTML/text structure, replace real values with test values.
  const sampleBody = `
    <html>
      <body>
        <h1>Your receipt from My Vendor</h1>
        <p>Invoice #INV-TEST-001</p>
        <p>Date: January 15, 2026</p>
        <table>
          <tr><td>Pro Plan (monthly)</td><td>$9.99</td></tr>
        </table>
        <p>Total: $9.99</p>
      </body>
    </html>
  `;

  it("handles the domains it claims", () => {
    // expect(myVendor.domains).toContain("vendor.com");
  });

  it("extracts total and date from billing email", () => {
    // const result = myVendor.parse(sampleBody, "Your receipt from My Vendor");
    // expect(result).not.toBeNull();
    // expect(result!.totalCents).toBe(999);
    // expect(result!.currency).toBe("USD");
    // expect(result!.date).toBe("2026-01-15");
  });

  it("extracts invoice ID when present", () => {
    // const result = myVendor.parse(sampleBody, "Your receipt");
    // expect(result!.invoiceId).toBe("INV-TEST-001");
  });

  it("returns null for non-receipt emails from the same vendor", () => {
    // expect(myVendor.parse("Welcome to My Vendor!", "Welcome")).toBeNull();
    // expect(myVendor.parse("Your password was changed", "Security alert")).toBeNull();
  });

  it("returns null for malformed email bodies", () => {
    // expect(myVendor.parse("", "")).toBeNull();
    // expect(myVendor.parse("<html></html>", "Receipt")).toBeNull();
  });
});
