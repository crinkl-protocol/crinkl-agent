import { describe, it, expect, vi, afterEach } from "vitest";
import { CrinklClient } from "../src/crinkl.js";

const client = new CrinklClient({
  crinklApiKey: "test-key", crinklApiUrl: "https://example.invalid", gmailClientId: "",
  gmailClientSecret: "", maxEmailAgeDays: 14, credentialsPath: "unused",
});
afterEach(() => vi.unstubAllGlobals());

describe.each(["verifyEmailReceipt", "submitEmailReceipt"] as const)("Crinkl client %s", (method) => {
  it("carries HTTP status and encodes only the eml", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), {
      status: 201, headers: { "content-type": "application/json; charset=utf-8" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await client[method]("raw-test")).toMatchObject({ success: true, httpStatus: 201 });
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://example.invalid/api/agent/${method === "verifyEmailReceipt" ? "verify" : "submit"}-email-receipt`);
    expect(JSON.parse(request.body)).toEqual({ eml: Buffer.from("raw-test").toString("base64") });
  });

  it("reads a JSON error code despite non-OK HTTP status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, code: "DAILY_RECEIPT_LIMIT_REACHED" }), {
      status: 429, headers: { "content-type": "application/json" },
    })));
    expect(await client[method]("raw-test")).toMatchObject({
      success: false, httpStatus: 429, code: "DAILY_RECEIPT_LIMIT_REACHED", error: "Crinkl API HTTP 429",
    });
  });

  it("reports a 502 HTML page without calling json or exposing its content", async () => {
    const response = new Response("<html>private proxy content</html>", { status: 502, headers: { "content-type": "text/html" } });
    const json = vi.spyOn(response, "json");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    expect(await client[method]("raw-test")).toEqual({
      success: false, httpStatus: 502, error: "Crinkl API HTTP 502: expected JSON response",
    });
    expect(json).not.toHaveBeenCalled();
  });

  it.each(["{broken", "null", "[]"])("handles malformed JSON %s", async (body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status: 200, headers: { "content-type": "application/json" } })));
    expect(await client[method]("raw-test")).toEqual({ success: false, httpStatus: 200, error: "Crinkl API HTTP 200: invalid JSON response" });
  });
});
