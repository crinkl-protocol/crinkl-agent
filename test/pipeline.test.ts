import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { processEmails } from "../src/pipeline.js";
import { CrinklClient } from "../src/crinkl.js";
import { fakeSource, fakeClient, verified, submitted } from "./helpers.js";

beforeEach(() => vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Network forbidden in tests"); })));
afterEach(() => vi.unstubAllGlobals());

function setup() {
  return {
    source: fakeSource(["1", "2", "3"].map((messageId) => ({ messageId, from: "Billing <a@paddle.com>", subject: "Receipt" }))),
    client: fakeClient(), vendors: [{ domain: "paddle.com", name: "Paddle" }],
    submittedIds: new Set<string>(), log: vi.fn(),
  };
}

describe("shared receipt pipeline", () => {
  it.each([
    ["text/html", "<html>Upstream failure</html>"],
    ["application/json", "{broken"],
    ["application/json", "null"],
    ["application/json", "{}"],
    ["application/json", '{"success":false}'],
    ["application/json", '{"success":true,"error":"Upstream failure"}'],
    ["application/json", '{"success":false,"error":42}'],
    ["application/json", '{"success":false,"error":"   "}'],
  ])("retries HTTP 422 preview format failures (%s, %s) through the real client", async (contentType, body) => {
    const options = setup();
    options.source = fakeSource([{ messageId: "1", from: "billing@paddle.com", subject: "Receipt" }]);
    const client = new CrinklClient({
      crinklApiKey: "test-key", crinklApiUrl: "https://example.invalid", gmailClientId: "",
      gmailClientSecret: "", maxEmailAgeDays: 14, credentialsPath: "unused",
    });
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(body, { status: 422, headers: { "content-type": contentType } }));
    vi.stubGlobal("fetch", fetchMock);
    for (let run = 0; run < 2; run++) {
      expect(await processEmails({ ...options, client })).toEqual({ submitted: 0, skipped: 0, errors: 1, dailyLimitReached: false });
      expect(options.submittedIds.size).toBe(0);
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every(([url]) => String(url).endsWith("/verify-email-receipt"))).toBe(true);
  });

  it("marks a real HTTP 422 validation rejection through the real client", async () => {
    const options = setup();
    const client = new CrinklClient({
      crinklApiKey: "test-key", crinklApiUrl: "https://example.invalid", gmailClientId: "",
      gmailClientSecret: "", maxEmailAgeDays: 14, credentialsPath: "unused",
    });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: false, error: "DKIM failed" }), {
      status: 422, headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    expect((await processEmails({ ...options, client })).skipped).toBe(3);
    expect(options.submittedIds.size).toBe(3);
    await processEmails({ ...options, client });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("leaves transport failures retryable through the real client", async () => {
    const options = setup();
    const client = new CrinklClient({
      crinklApiKey: "test-key", crinklApiUrl: "https://example.invalid", gmailClientId: "",
      gmailClientSecret: "", maxEmailAgeDays: 14, credentialsPath: "unused",
    });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Connection reset")));
    expect((await processEmails({ ...options, client })).errors).toBe(3);
    expect(options.submittedIds.size).toBe(0);
  });

  it.each([
    "Vendor <billing@anthropic.com> (Accounts)",
    "billing@anthropic.com",
    '"Vendor, <billing@other.example>" <billing@anthropic.com> (Accounts)',
  ])("applies the vendor subject filter for %s", async (from) => {
    const options = setup();
    options.vendors = [{ domain: "anthropic.com", name: "Anthropic" }];
    options.source = fakeSource([{ messageId: "1", from, subject: "Your payment" }]);
    expect((await processEmails(options)).skipped).toBe(1);
    expect(options.source.downloadRawEml).not.toHaveBeenCalled();
    expect(options.client.verifyEmailReceipt).not.toHaveBeenCalled();
    expect(options.client.submitEmailReceipt).not.toHaveBeenCalled();
  });

  it("marks submitted receipts and deduplicates before downloading", async () => {
    const options = setup();
    options.submittedIds.add("1");
    expect(await processEmails(options)).toEqual({ submitted: 2, skipped: 1, errors: 0, dailyLimitReached: false });
    expect([...options.submittedIds]).toEqual(["1", "2", "3"]);
    expect(options.source.downloadRawEml.mock.calls).toEqual([["2"], ["3"]]);
  });

  it("leaves queued receipts unmarked for retry", async () => {
    const options = setup();
    options.client.submitEmailReceipt.mockResolvedValue({ success: true, status: "QUEUED_FOR_REVIEW", httpStatus: 202 });
    expect((await processEmails(options)).skipped).toBe(3);
    expect(options.submittedIds.size).toBe(0);
  });

  it.each([{ success: false, httpStatus: 409 }, { success: false, error: "Email has already been submitted" }])("marks duplicate receipts", async (duplicate) => {
    const options = setup();
    options.client.submitEmailReceipt.mockResolvedValue(duplicate);
    expect((await processEmails(options)).skipped).toBe(3);
    expect(options.submittedIds.size).toBe(3);
  });

  it.each([
    { success: false, httpStatus: 422, error: "DKIM failed", validationRejected: true },
    { ...verified, data: { ...verified.data!, dkimVerified: false } },
  ])("marks DKIM failures without submitting", async (failure) => {
    const options = setup();
    options.client.verifyEmailReceipt.mockResolvedValue(failure);
    expect((await processEmails(options)).skipped).toBe(3);
    expect(options.submittedIds.size).toBe(3);
    expect(options.client.submitEmailReceipt).not.toHaveBeenCalled();
  });

  it.each([{ success: false, httpStatus: 429 }, { success: false, code: "DAILY_RECEIPT_LIMIT_REACHED", httpStatus: 200 }])("stops at the daily limit and leaves the blocked/rest unmarked", async (limit) => {
    const options = setup();
    options.client.submitEmailReceipt.mockResolvedValueOnce(submitted).mockResolvedValueOnce(limit);
    const summary = await processEmails(options);
    expect(summary.dailyLimitReached).toBe(true);
    expect([...options.submittedIds]).toEqual(["1"]);
    expect(options.source.downloadRawEml.mock.calls).toEqual([["1"], ["2"]]);
    expect(options.client.submitEmailReceipt).toHaveBeenCalledTimes(2);
    expect(options.log.mock.calls.filter(([line]) => line.startsWith("DAILY LIMIT:"))).toHaveLength(1);
  });

  it("also stops when preview hits the daily limit", async () => {
    const options = setup();
    options.client.verifyEmailReceipt.mockResolvedValue({ success: false, code: "DAILY_RECEIPT_LIMIT_REACHED" });
    expect((await processEmails(options)).dailyLimitReached).toBe(true);
    expect(options.client.submitEmailReceipt).not.toHaveBeenCalled();
    expect(options.source.getMetadata).toHaveBeenCalledTimes(1);
    expect(options.submittedIds.size).toBe(0);
  });

  it("previews in --scan without submitting", async () => {
    const options = setup();
    await processEmails({ ...options, scanOnly: true });
    expect(options.client.verifyEmailReceipt).toHaveBeenCalledTimes(3);
    expect(options.client.submitEmailReceipt).not.toHaveBeenCalled();
    expect(options.submittedIds.size).toBe(0);
  });

  it("filters allowed senders using subject alone while forwarding unknown senders", async () => {
    const options = setup();
    options.source = fakeSource([
      { messageId: "known", from: '"Receipt" <a@paddle.com>', subject: "Welcome" },
      { messageId: "unknown", from: "a@new.example", subject: "Welcome" },
    ]);
    await processEmails(options);
    expect(options.source.downloadRawEml.mock.calls).toEqual([["unknown"]]);
    expect(options.client.submitEmailReceipt).toHaveBeenCalledTimes(1);
  });

  it("retries preview service/auth failures and submission errors", async () => {
    const options = setup();
    options.client.verifyEmailReceipt.mockResolvedValueOnce({ success: false, httpStatus: 502, error: "Expected JSON" });
    options.client.submitEmailReceipt.mockResolvedValue({ success: false, httpStatus: 500 });
    expect((await processEmails(options)).errors).toBe(3);
    expect(options.submittedIds.size).toBe(0);
  });

  it("continues after one email download fails", async () => {
    const options = setup();
    options.source.downloadRawEml.mockRejectedValueOnce(new Error("download failed"));
    const summary = await processEmails(options);
    expect(summary.errors).toBe(1);
    expect(summary.submitted).toBe(2);
    expect(options.submittedIds.has("1")).toBe(false);
  });
});
