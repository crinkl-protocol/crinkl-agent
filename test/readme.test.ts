import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("documented discovery commands", () => {
  it.each(["gmail", "agentmail", "json"])("suppresses npm's stdout banner for %s discovery", (mode) => {
    const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
    const commands = readme.split("\n").filter((line) => line.startsWith("npm run ") && line.includes("--discover"));
    const command = commands.find((line) => mode === "json" ? line.includes("--json")
      : mode === "agentmail" ? line.includes("--agentmail") : !line.includes("--json") && !line.includes("--agentmail"));
    expect(command).toBeDefined();
    // --help exits before credentials, inbox access or any API calls. It still
    // exercises npm's stdout around the exact documented discovery command.
    const args = command!.split("#")[0].trim().split(/\s+/).slice(1);
    const stdout = execFileSync("npm", [...args, "--help"], {
      cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8",
      env: { ...process.env, npm_config_loglevel: "notice" }, timeout: 10000,
    });
    expect(stdout.startsWith("Crinkl Email Receipt Agent\n\nScans")).toBe(true);
  });
});
