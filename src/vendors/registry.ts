import { generic } from "./generic.js";
import type { VendorParser } from "./types.js";

const parsers: VendorParser[] = [generic];

/** Find a parser for the given email domain. Falls back to generic. */
export function getParser(domain: string): VendorParser {
  return parsers.find((p) => p.domains.includes(domain)) ?? generic;
}

/** Register a vendor-specific parser. */
export function registerParser(parser: VendorParser): void {
  parsers.push(parser);
}
