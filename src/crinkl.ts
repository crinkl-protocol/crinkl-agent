/**
 * Crinkl API client — wrappers for the DKIM email receipt endpoints.
 *
 * All communication goes through the public REST API.
 * Only the .eml content is sent — no inbox access is shared.
 */

import type { Config } from "./config.js";

export interface VerifyResult {
  success: boolean;
  httpStatus?: number;
  code?: string;
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

export interface SubmitResult {
  success: boolean;
  httpStatus?: number;
  code?: string;
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
    return this.post<VerifyResult>("verify-email-receipt", rawEml);
  }

  /** Submit a DKIM-verified email receipt for rewards */
  async submitEmailReceipt(rawEml: string): Promise<SubmitResult> {
    return this.post<SubmitResult>("submit-email-receipt", rawEml);
  }

  private async post<T extends VerifyResult | SubmitResult>(route: string, rawEml: string): Promise<T> {
    const eml = Buffer.from(rawEml).toString("base64");
    const response = await fetch(
      `${this.apiUrl}/api/agent/${route}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
        },
        body: JSON.stringify({ eml }),
      }
    );
    const httpStatus = response.status;
    const httpLabel = `Crinkl API HTTP ${httpStatus}`;
    const httpError = response.ok ? undefined : httpLabel;
    const contentType = response.headers.get("content-type") || "";
    if (!/\bapplication\/(?:[\w.-]+\+)?json\b/i.test(contentType)) {
      return { success: false, httpStatus, error: `${httpLabel}: expected JSON response` } as T;
    }
    try {
      const body: unknown = await response.json();
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new Error("Invalid response");
      }
      const result = body as T;
      return {
        ...result,
        success: response.ok && result.success === true,
        httpStatus,
        error: result.error || httpError,
      };
    } catch {
      return { success: false, httpStatus, error: `Crinkl API HTTP ${httpStatus}: invalid JSON response` } as T;
    }
  }
}
