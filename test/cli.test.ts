import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fakeSource } from "./helpers.js";
import { runCli } from "../src/cli.js";
import { parseFlags } from "../src/index.js";
import { CrinklClient } from "../src/crinkl.js";
import { loadConfig } from "../src/config.js";
import { gmailSource, getGmailClient } from "../src/gmail.js";
import { agentmailSource } from "../src/agentmail.js";

vi.mock("../src/config.js", () => ({ loadConfig: vi.fn(() => ({ crinklApiUrl: "https://example.invalid", maxEmailAgeDays: 7 })) }));
vi.mock("../src/gmail.js", () => ({ getGmailClient: vi.fn(async () => ({})), gmailSource: vi.fn() }));
vi.mock("../src/agentmail.js", () => ({ agentmailSource: vi.fn() }));
vi.mock("../src/vendors.js", () => ({
  loadVendors: vi.fn(async (_url, log) => { log("Using shipped allowlist"); return []; }),
}));

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Network forbidden in tests"); }));
  vi.stubEnv("AGENTMAIL_API_KEY", "test-key");
  vi.stubEnv("AGENTMAIL_INBOX_ID", "test-inbox");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("CLI discovery", () => {
  it("can import the entry without starting a run", () => {
    expect(loadConfig).not.toHaveBeenCalled();
    expect(parseFlags(["--scan", "--agentmail"])).toMatchObject({ scanOnly: true, useAgentMail: true, discover: false });
  });

  it.each([false, true])("prints only domain counts and never verifies/submits for AgentMail=%s", async (agentmail) => {
    const source = fakeSource([{ messageId: "secret-id", from: "Secret <private@new.example>", subject: "Receipt $999" }]);
    vi.mocked(gmailSource).mockReturnValue(source);
    vi.mocked(agentmailSource).mockReturnValue(source);
    const stdout = vi.spyOn(console, "log").mockImplementation(() => {});
    const stderr = vi.spyOn(console, "error").mockImplementation(() => {});
    const verify = vi.spyOn(CrinklClient.prototype, "verifyEmailReceipt");
    const submit = vi.spyOn(CrinklClient.prototype, "submitEmailReceipt");
    await runCli(parseFlags(["--discover", "--json", ...(agentmail ? ["--agentmail"] : [])]));
    expect(stdout).toHaveBeenCalledTimes(1);
    expect(JSON.parse(stdout.mock.calls[0][0])).toEqual([{ domain: "new.example", count: 1 }]);
    expect(stderr).toHaveBeenCalledWith("Using shipped allowlist");
    expect(verify).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
    expect(source.downloadRawEml).not.toHaveBeenCalled();
    expect(loadConfig).toHaveBeenCalledWith({ agentmail, discover: true });
    if (agentmail) expect(agentmailSource).toHaveBeenCalledWith({ apiKey: "test-key" }, "test-inbox", 7, true);
    else {
      expect(gmailSource).toHaveBeenCalledWith({}, [], 7, true);
      expect(getGmailClient).toHaveBeenCalledWith(expect.anything(), console.error, process.stderr);
    }
  });

  it("rejects JSON without discovery and auth combined with discovery", async () => {
    await expect(runCli(parseFlags(["--json"]))).rejects.toThrow("--json requires --discover");
    await expect(runCli(parseFlags(["--auth", "--discover"]))).rejects.toThrow("Use --auth separately");
  });
});
