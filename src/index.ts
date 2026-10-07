#!/usr/bin/env node
import { existsSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runCli, type CliOptions } from "./cli.js";

export function parseFlags(args: string[]): CliOptions {
  return {
    help: args.includes("--help") || args.includes("-h"),
    authOnly: args.includes("--auth"),
    scanOnly: args.includes("--scan"),
    useAgentMail: args.includes("--agentmail"),
    discover: args.includes("--discover"),
    json: args.includes("--json"),
  };
}

if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli(parseFlags(process.argv.slice(2))).catch((err: unknown) => {
    console.error("Fatal error:", err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
}
