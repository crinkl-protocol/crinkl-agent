/**
 * Vendor allowlist — fetched from the Crinkl API on each run.
 *
 * Falls back to the shipped allowlist.json if the API is unreachable.
 * Unknown vendors hit 202 (queued for review) on the server.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export interface Vendor {
  domain: string;
  name: string;
  category?: string;
}

interface AllowlistFile {
  version: number;
  updated: string;
  vendors: Vendor[];
}

interface ApiVendor {
  domain: string;
  displayName: string;
}

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Fetch vendors from the Crinkl API, fall back to shipped allowlist. */
export async function loadVendors(apiUrl: string): Promise<Vendor[]> {
  try {
    const response = await fetch(`${apiUrl}/api/agent/allowed-vendors`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = (await response.json()) as {
      success: boolean;
      data: { vendors: ApiVendor[] };
    };
    return body.data.vendors.map((v) => ({
      domain: v.domain,
      name: v.displayName,
    }));
  } catch {
    console.log("  Could not reach vendor API — using shipped allowlist.\n");
    return loadLocalVendors();
  }
}

/** Load the fallback vendor list shipped with the package. */
function loadLocalVendors(): Vendor[] {
  const allowlistPath = resolve(__dirname, "..", "vendors", "allowlist.json");
  const raw = readFileSync(allowlistPath, "utf-8");
  const data: AllowlistFile = JSON.parse(raw);
  return data.vendors;
}
