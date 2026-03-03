/**
 * Crinkl API client — wrappers for the DKIM email receipt endpoints.
 *
 * All communication goes through the public REST API.
 * Only the .eml content is sent — no inbox access is shared.
 */

import type { Config } from "./config.js";

interface VerifyResult {
  success: boolean;
  data?: {
    dkimVerified: boolean;
    dkimDomain: string;
    provider: string;
    totalCents: number;
    date: string;
    invoiceId: string | null;
    subject: string;
    currency: string;
    lineItems: Array<{ description: string; amountCents: number }>;
  };
  error?: string;
  domain?: string;
  date?: string;
  maxAgeDays?: number;
}

interface SubmitResult {
  success: boolean;
  /** Present when spend was created (201) */
  data?: {
    submissionId: string;
    spendId: string;
    provider: string;
    store: string;
    storeId: string;
    totalCents: number;
    date: string;
    currency: string;
    invoiceId: string | null;
    dkimDomain: string;
    status: string;
    verificationMethod: string;
  };
  /** Present when vendor is unknown and queued for admin review (202) */
  status?: "QUEUED_FOR_REVIEW";
  message?: string;
  error?: string;
  domain?: string;
}

export class CrinklClient {
  private apiUrl: string;
  private apiKey: string;

  constructor(config: Config) {
    this.apiUrl = config.crinklApiUrl;
    this.apiKey = config.crinklApiKey;
  }

  /** Preview DKIM verification without submitting */
  async verifyEmailReceipt(rawEml: string): Promise<VerifyResult> {
    const eml = Buffer.from(rawEml).toString("base64");
    const response = await fetch(
      `${this.apiUrl}/api/agent/verify-email-receipt`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
        },
        body: JSON.stringify({ eml }),
      }
    );
    return response.json() as Promise<VerifyResult>;
  }

  /** Submit a DKIM-verified email receipt for rewards */
  async submitEmailReceipt(rawEml: string): Promise<SubmitResult> {
    const eml = Buffer.from(rawEml).toString("base64");
    const response = await fetch(
      `${this.apiUrl}/api/agent/submit-email-receipt`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
        },
        body: JSON.stringify({ eml }),
      }
    );
    return response.json() as Promise<SubmitResult>;
  }
}
