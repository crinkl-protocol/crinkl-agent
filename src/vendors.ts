/**
 * Load the vendor allowlist shipped with the package.
 *
 * This is the sole source of which vendors the agent scans for.
 * Unknown vendors hit 202 (queued for review) on the server.
 * Once approved server-side, they verify on the next run.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export interface Vendor {
  domain: string;
  name: string;
  category: string;
}

interface AllowlistFile {
  version: number;
  updated: string;
  vendors: Vendor[];
}

const __dirname = dirname(fileURLToPath(import.meta.url));

export function loadVendors(): Vendor[] {
  const allowlistPath = resolve(__dirname, "..", "vendors", "allowlist.json");
  const raw = readFileSync(allowlistPath, "utf-8");
  const data: AllowlistFile = JSON.parse(raw);
  return data.vendors;
}
