import { describe, it, expect } from "vitest";
import { getParser, registerParser } from "../../src/vendors/registry.js";
import { generic } from "../../src/vendors/generic.js";
import type { VendorParser } from "../../src/vendors/types.js";

describe("vendor registry", () => {
  it("returns generic for unknown domains", () => {
    expect(getParser("unknown.com")).toBe(generic);
    expect(getParser("")).toBe(generic);
  });

  it("returns a registered parser for its domains", () => {
    const testParser: VendorParser = {
      domains: ["test-vendor.com", "billing.test-vendor.com"],
      name: "Test Vendor",
      parse(body, subject) {
        const match = body.match(/Total:\s*\$(\d+\.\d{2})/);
        if (!match) return null;
        return {
          totalCents: Math.round(parseFloat(match[1]) * 100),
          currency: "USD",
          date: "2026-01-15",
        };
      },
    };

    registerParser(testParser);

    expect(getParser("test-vendor.com")).toBe(testParser);
    expect(getParser("billing.test-vendor.com")).toBe(testParser);
    expect(getParser("other.com")).toBe(generic);
  });
});
