import type { VendorParser } from "./types.js";

/**
 * Generic fallback parser — the server does the real parsing.
 * This always returns null, meaning "no local pre-parse available".
 * The server handles extraction for all vendors authoritatively.
 */
export const generic: VendorParser = {
  domains: [],
  name: "generic",
  parse() {
    return null;
  },
};
