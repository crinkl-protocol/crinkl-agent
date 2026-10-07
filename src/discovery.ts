import type { EmailSource } from "./pipeline.js";
import type { Vendor } from "./vendors.js";
import { isDefaultReceiptSubject, matchVendorDomain, senderDomain } from "./filters.js";

export interface DiscoveryCount {
  domain: string;
  count: number;
}

/** Sources supply only messages within the configured age window. No bodies needed. */
export async function discoverSenders(source: EmailSource, vendors: Vendor[]): Promise<DiscoveryCount[]> {
  const counts = new Map<string, number>();
  for (const { messageId } of await source.listMessages()) {
    const { subject, from } = await source.getMetadata(messageId);
    if (!isDefaultReceiptSubject(subject) || matchVendorDomain(from, vendors)) continue;
    const domain = senderDomain(from);
    if (domain) counts.set(domain, (counts.get(domain) ?? 0) + 1);
  }
  return [...counts].map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain));
}

export function formatDiscovery(counts: DiscoveryCount[], json = false): string {
  // Select fields explicitly so no provider metadata can appear in the output.
  const rows = counts.map(({ domain, count }) => ({ domain, count }));
  if (json) return JSON.stringify(rows, null, 2);
  const width = Math.max("Sender domain".length, ...rows.map((row) => row.domain.length));
  return [
    `${"Sender domain".padEnd(width)}  Count`,
    ...rows.map((row) => `${row.domain.padEnd(width)}  ${row.count}`),
  ].join("\n");
}
