import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { processEmails } from "../src/pipeline.js";
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
    { success: false, httpStatus: 422, error: "DKIM failed" },
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
