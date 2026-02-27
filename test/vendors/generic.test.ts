import { describe, it, expect } from "vitest";
import { generic } from "../../src/vendors/generic.js";

describe("generic parser", () => {
  it("has no domains (catch-all)", () => {
    expect(generic.domains).toEqual([]);
  });

  it("always returns null (server does authoritative parsing)", () => {
    expect(generic.parse("Any email body content", "Any subject")).toBeNull();
    expect(generic.parse("", "")).toBeNull();
    expect(generic.parse("Total: $99.00", "Your receipt")).toBeNull();
  });
});
