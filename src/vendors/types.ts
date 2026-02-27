export interface ParsedReceipt {
  totalCents: number;
  currency: string;
  /** ISO date string (YYYY-MM-DD) */
  date: string;
  invoiceId?: string;
  lineItems?: Array<{ description: string; amountCents: number }>;
}

export interface VendorParser {
  /** Domains this parser handles (e.g. ["suno.com", "suno.ai"]) */
  domains: string[];
  /** Display name */
  name: string;
  /** Parse receipt email body → structured data. Return null if can't parse. */
  parse(emailBody: string, subject: string): ParsedReceipt | null;
}
