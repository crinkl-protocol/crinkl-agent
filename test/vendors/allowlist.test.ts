import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadVendors } from "../../src/vendors.js";

const here = dirname(fileURLToPath(import.meta.url));
const allowlist = JSON.parse(
  readFileSync(resolve(here, "..", "..", "vendors", "allowlist.json"), "utf-8")
) as { version: number; updated: string; vendors: { domain: string; name: string }[] };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("shipped allowlist.json", () => {
  it("parses with a version, date and vendors", () => {
    expect(typeof allowlist.version).toBe("number");
    expect(allowlist.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(allowlist.vendors.length).toBeGreaterThan(0);
  });

  it("has unique lowercase domains", () => {
    const domains = allowlist.vendors.map((v) => v.domain);
    expect(new Set(domains).size).toBe(domains.length);
    for (const d of domains) expect(d).toBe(d.toLowerCase());
  });

  it("has non-empty names", () => {
    for (const v of allowlist.vendors) expect(v.name.trim()).not.toBe("");
  });
});

describe("loadVendors", () => {
  it("falls back to the shipped list when fetch fails", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const vendors = await loadVendors("https://example.invalid");
    expect(vendors).toEqual(allowlist.vendors);
  });

  it("falls back on a non-OK response", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    const vendors = await loadVendors("https://example.invalid");
    expect(vendors).toEqual(allowlist.vendors);
  });

  it("maps displayName to name when the API succeeds", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { vendors: [{ domain: "stripe.com", displayName: "Stripe" }] },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const vendors = await loadVendors("https://api.test");
    expect(vendors).toEqual([{ domain: "stripe.com", name: "Stripe" }]);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.test/api/agent/allowed-vendors");
  });
});
