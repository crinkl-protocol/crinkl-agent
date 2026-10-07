import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { discoverSenders, formatDiscovery } from "../src/discovery.js";
import { fakeSource } from "./helpers.js";

beforeEach(() => vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Network forbidden in tests"); })));
afterEach(() => vi.unstubAllGlobals());

describe("discovery", () => {
  it("counts only unknown receipt-like sender domains, sorted by count then domain", async () => {
    const source = fakeSource([
      { messageId: "1", from: "Private Name <private@new.example>", subject: "Receipt for $123.45" },
      { messageId: "2", from: "other@NEW.EXAMPLE", subject: "Your order #private-id" },
      { messageId: "3", from: "private@z.example", subject: "Billing statement" },
      { messageId: "4", from: "private@a.example", subject: "Payment" },
      { messageId: "5", from: "billing@sub.paddle.com", subject: "Receipt" },
      { messageId: "6", from: "private@newsletter.example", subject: "Welcome" },
      { messageId: "7", from: "invalid sender", subject: "Invoice" },
    ]);
    const result = await discoverSenders(source, [{ domain: "paddle.com", name: "Paddle" }]);
    expect(result).toEqual([
      { domain: "new.example", count: 2 }, { domain: "a.example", count: 1 }, { domain: "z.example", count: 1 },
    ]);
    expect(source.downloadRawEml).not.toHaveBeenCalled();
    const json = formatDiscovery(result, true);
    expect(JSON.parse(json)).toEqual(result);
    const table = formatDiscovery(result);
    expect(table.split("\n").map((line) => line.trim().split(/\s+/))).toEqual([
      ["Sender", "domain", "Count"], ["new.example", "2"], ["a.example", "1"], ["z.example", "1"],
    ]);
    for (const output of [json, table]) {
      for (const secret of ["Private", "private@", "Receipt", "123.45", "private-id", "Billing statement"]) {
        expect(output).not.toContain(secret);
      }
    }
  });

  it("produces empty results without private metadata", async () => {
    expect(await discoverSenders(fakeSource([]), [])).toEqual([]);
    expect(formatDiscovery([], true)).toBe("[]");
    expect(formatDiscovery([])).toBe("Sender domain  Count");
  });

  it("selects only domain and count even if a row carries extra metadata", () => {
    const rows = [{ domain: "new.example", count: 1, subject: "private", from: "private", body: "private" }];
    expect(formatDiscovery(rows, true)).not.toContain("private");
    expect(formatDiscovery(rows)).not.toContain("private");
  });
});
