// @/services/paymentNotificationRouting.test.ts
//
// Regression tests for H-1: routeMidtransNotification() used to verify the
// Midtrans signature only inside processMidtransNotification(), i.e. only on
// the POS branch. Any order_id starting with "GRM-SUB" was dispatched to the
// billing service straight from the public webhook route with no
// verification at all, which PRD §23.5 explicitly forbids ("tidak ada jalur
// pintas").

import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const verifyNotificationSignature = vi.fn();
const getTransactionStatus = vi.fn();

vi.mock("@/lib/mongodb", () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/midtrans", () => ({
  verifyNotificationSignature: (...args: unknown[]) =>
    verifyNotificationSignature(...args),
  getTransactionStatus: (...args: unknown[]) => getTransactionStatus(...args),
  createQrisCharge: vi.fn(),
}));

const processSubscriptionInvoiceNotification = vi.fn();
vi.mock("@/services/billingService", () => ({
  processSubscriptionInvoiceNotification: (...args: unknown[]) =>
    processSubscriptionInvoiceNotification(...args),
}));

const paymentFindOne = vi.fn();
vi.mock("@/models/Payment", () => ({
  default: {
    findOne: (...args: unknown[]) => paymentFindOne(...args),
    countDocuments: vi.fn().mockResolvedValue(0),
  },
}));

vi.mock("@/models/Transaction", () => ({
  default: { findById: vi.fn().mockResolvedValue(null) },
}));

const { routeMidtransNotification } = await import("@/services/paymentService");

function payload(orderId: string) {
  return {
    order_id: orderId,
    status_code: "200",
    gross_amount: "50000.00",
    signature_key: "whatever-the-attacker-sends",
  };
}

describe("routeMidtransNotification signature enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    paymentFindOne.mockReturnValue({ sort: () => null });
  });

  it("rejects a subscription notification with an invalid signature", async () => {
    verifyNotificationSignature.mockReturnValue(false);

    await expect(
      routeMidtransNotification(payload("GRM-SUB-202610-000001")),
    ).rejects.toBeInstanceOf(AppError);

    // The actual H-1 defect: this used to be invoked regardless of signature.
    expect(processSubscriptionInvoiceNotification).not.toHaveBeenCalled();
  });

  it("returns a 403 FORBIDDEN AppError on signature mismatch", async () => {
    verifyNotificationSignature.mockReturnValue(false);

    try {
      await routeMidtransNotification(payload("GRM-SUB-202610-000001"));
      throw new Error("expected routeMidtransNotification to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("FORBIDDEN");
      expect((error as AppError).status).toBe(403);
    }
  });

  it("rejects a POS notification with an invalid signature", async () => {
    verifyNotificationSignature.mockReturnValue(false);

    await expect(
      routeMidtransNotification(payload("GRM-20261015-000001")),
    ).rejects.toBeInstanceOf(AppError);
    expect(getTransactionStatus).not.toHaveBeenCalled();
  });

  it("dispatches to billing only once the signature is valid", async () => {
    verifyNotificationSignature.mockReturnValue(true);
    processSubscriptionInvoiceNotification.mockResolvedValue({
      applied: true,
      reason: "status_updated",
    });

    const result = await routeMidtransNotification(
      payload("GRM-SUB-202610-000001"),
    );

    expect(processSubscriptionInvoiceNotification).toHaveBeenCalledWith(
      "GRM-SUB-202610-000001",
    );
    expect(result).toEqual({ applied: true, reason: "status_updated" });
  });

  it("rejects a malformed payload before any signature work", async () => {
    await expect(
      routeMidtransNotification({ nope: true }),
    ).rejects.toBeInstanceOf(AppError);
    expect(verifyNotificationSignature).not.toHaveBeenCalled();
  });
});
