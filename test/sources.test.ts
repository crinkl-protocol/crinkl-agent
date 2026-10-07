import { describe, it, expect, vi, afterEach } from "vitest";
import { gmailSource } from "../src/gmail.js";
import { agentmailSource } from "../src/agentmail.js";

// No OAuth client or network is needed to test the Gmail adapter.
vi.mock("googleapis", () => ({ google: {} }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Gmail source", () => {
  it("searches receipt subjects across all senders and consumes every discovery page", async () => {
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Network forbidden"); }));
    const list = vi.fn()
      .mockResolvedValueOnce({ data: { messages: [{ id: "1" }], nextPageToken: "next" } })
      .mockResolvedValueOnce({ data: { messages: [{ id: "2" }] } });
    const get = vi.fn().mockResolvedValue({ data: { payload: { headers: [
      { name: "subject", value: "Receipt" }, { name: "FROM", value: "Vendor <a@new.example>" },
    ] } } });
    const gmail = { users: { messages: { list, get } } };
    const source = gmailSource(gmail as never, [], 7, true);
    expect(await source.listMessages()).toEqual([{ messageId: "1" }, { messageId: "2" }]);
    expect(list.mock.calls[0][0].q).toContain('subject:"receipt"');
    expect(list.mock.calls[0][0].q).toContain('subject:"billing statement"');
    expect(list.mock.calls[0][0].q).toContain("newer_than:7d");
    expect(list.mock.calls[0][0].q).not.toContain("from:");
    expect(list.mock.calls[1][0].pageToken).toBe("next");
    expect(await source.getMetadata("1")).toEqual({ subject: "Receipt", from: "Vendor <a@new.example>" });
    expect(get.mock.calls[0][0]).toMatchObject({ format: "metadata", metadataHeaders: ["Subject", "From"] });
  });

  it("keeps the normal scan restricted to allowed vendors", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const list = vi.fn().mockResolvedValue({ data: { messages: [{ id: "1" }] } });
    const gmail = { users: { messages: { list } } };
    await gmailSource(gmail as never, [{ domain: "paddle.com", name: "Paddle" }], 14).listMessages();
    expect(list.mock.calls[0][0].q).toBe("(from:@paddle.com) newer_than:14d");
  });
});

describe("AgentMail source", () => {
  it.each([true, false])("uses the age window and paginates only discovery=%s", async (discover) => {
    const message = (id: string) => ({
      message_id: id, inbox_id: "inbox", from: [{ email: "a@new.example" }], subject: "Invoice", timestamp: "2026-10-07",
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ messages: [message("1")], next_page_token: "next" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ messages: [message("2")] })));
    vi.stubGlobal("fetch", fetchMock);
    const start = Date.now();
    const source = agentmailSource({ apiKey: "test-key" }, "inbox", 7, discover);
    expect(await source.listMessages()).toEqual(discover ? [{ messageId: "1" }, { messageId: "2" }] : [{ messageId: "1" }]);
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(Date.parse(url.searchParams.get("after")!)).toBeGreaterThanOrEqual(start - 7 * 86_400_000);
    expect(url.searchParams.get("limit")).toBe("50");
    if (discover) expect(new URL(fetchMock.mock.calls[1][0]).searchParams.get("page_token")).toBe("next");
    expect(await source.getMetadata("1")).toEqual({ subject: "Invoice", from: "a@new.example" });
    expect(fetchMock).toHaveBeenCalledTimes(discover ? 2 : 1);
  });

  it("reads the current API's From string, including a display name", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ messages: [{
      message_id: "1", inbox_id: "inbox", from: "Vendor <a@new.example>", subject: "Invoice", timestamp: "2026-10-07",
    }] }))));
    const source = agentmailSource({ apiKey: "test-key" }, "inbox", 14, true);
    await source.listMessages();
    expect(await source.getMetadata("1")).toEqual({ subject: "Invoice", from: "Vendor <a@new.example>" });
  });
});
