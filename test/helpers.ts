import { vi } from "vitest";
import type { EmailMetadata } from "../src/pipeline.js";
import type { VerifyResult, SubmitResult } from "../src/crinkl.js";

export function fakeSource(messages: Array<EmailMetadata & { messageId: string }>) {
  return {
    listMessages: vi.fn(async () => messages.map(({ messageId }) => ({ messageId }))),
    getMetadata: vi.fn(async (id: string) => messages.find((message) => message.messageId === id)!),
    downloadRawEml: vi.fn(async (id: string) => `raw-${id}`),
  };
}

export const verified: VerifyResult = {
  success: true,
  data: {
    dkimVerified: true, dkimDomain: "paddle.com", provider: "email", totalCents: 100,
    date: "2026-10-07", invoiceId: null, subject: "Receipt", currency: "USD", lineItems: [],
  },
};

export const submitted: SubmitResult = {
  success: true, httpStatus: 201,
  data: {
    submissionId: "submission", spendId: "spend", provider: "email", store: "Store",
    storeId: "store", totalCents: 100, date: "2026-10-07", currency: "USD", invoiceId: null,
    dkimDomain: "paddle.com", status: "created", verificationMethod: "dkim",
  },
};

export function fakeClient() {
  return {
    verifyEmailReceipt: vi.fn(async (): Promise<VerifyResult> => verified),
    submitEmailReceipt: vi.fn(async (): Promise<SubmitResult> => submitted),
  };
}
