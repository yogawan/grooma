// @/services/billingNotification.test.ts
//
// Regression tests for M-1 and M-2 in processSubscriptionInvoiceNotification():
//   M-1  the subscription path had no transition guard, so a late `pending`
//        notification could walk a PAID invoice back to PENDING — something
//        §9.4 forbids and the POS path has always prevented.
//   M-2  an unknown invoice threw Errors.notFound("Invoice"); the caller
//        tried to detect it with `error.message === "NOT_FOUND"`, which never
//        matched (the message is "Invoice"), so the webhook answered 404 and
//        Midtrans retried that notification forever.
// Also covers the ObjectId-vs-document bug found while fixing the above:
// doc.populated("subscription") returns the populated _id, so calling
// .save() on it threw a TypeError on the paid-subscription activation path.

import { beforeEach, describe, expect, it, vi } from "vitest";

const getTransactionStatus = vi.fn();
vi.mock("@/lib/midtrans", () => ({
  getTransactionStatus: (...args: unknown[]) => getTransactionStatus(...args),
  createQrisCharge: vi.fn(),
  verifyNotificationSignature: vi.fn(),
}));

vi.mock("@/lib/mongodb", () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}));

const invoiceFindOne = vi.fn();
vi.mock("@/models/SubscriptionInvoice", () => ({
  default: {
    findOne: (...args: unknown[]) => invoiceFindOne(...args),
    countDocuments: vi.fn(),
    find: vi.fn(),
    updateMany: vi.fn(),
  },
}));

const subscriptionFindById = vi.fn();
vi.mock("@/models/Subscription", () => ({
  default: {
    findById: (...args: unknown[]) => subscriptionFindById(...args),
    find: vi.fn(),
    updateMany: vi.fn(),
  },
}));

const { processSubscriptionInvoiceNotification } = await import(
  "@/services/billingService"
);

const ORDER_ID = "GRM-SUB-202610-000001";

function fakeInvoice(status: string) {
  return {
    _id: { toString: () => "invoice-1" },
    status,
    subscription: "subscription-1",
    periodStart: new Date("2026-10-01"),
    periodEnd: new Date("2026-11-01"),
    paidAt: status === "PAID" ? new Date("2026-10-02") : undefined,
    lastNotificationAt: undefined as Date | undefined,
    providerTransactionId: undefined as string | undefined,
    save: vi.fn().mockResolvedValue(undefined),
  };
}

function midtransSays(transactionStatus: string) {
  getTransactionStatus.mockResolvedValue({
    providerOrderId: ORDER_ID,
    providerTransactionId: "mt-1",
    transactionStatus,
    grossAmount: 50000,
    fraudStatus: null,
  });
}

describe("processSubscriptionInvoiceNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("acks an unknown invoice instead of throwing (M-2)", async () => {
    invoiceFindOne.mockResolvedValue(null);

    const result = await processSubscriptionInvoiceNotification(ORDER_ID);

    expect(result).toEqual({ applied: false, reason: "unknown_order" });
    // Must not reach Midtrans for an invoice we don't have.
    expect(getTransactionStatus).not.toHaveBeenCalled();
  });

  it("refuses to move a PAID invoice back to PENDING (M-1)", async () => {
    const invoice = fakeInvoice("PAID");
    invoiceFindOne.mockResolvedValue(invoice);
    midtransSays("pending");

    const result = await processSubscriptionInvoiceNotification(ORDER_ID);

    expect(result).toEqual({ applied: false, reason: "invalid_transition" });
    expect(invoice.status).toBe("PAID");
    expect(invoice.save).not.toHaveBeenCalled();
  });

  it("refuses to move an EXPIRED invoice to PAID (M-1)", async () => {
    const invoice = fakeInvoice("EXPIRED");
    invoiceFindOne.mockResolvedValue(invoice);
    midtransSays("settlement");

    const result = await processSubscriptionInvoiceNotification(ORDER_ID);

    expect(result).toEqual({ applied: false, reason: "invalid_transition" });
    expect(invoice.status).toBe("EXPIRED");
  });

  it("allows PAID -> REFUNDED", async () => {
    const invoice = fakeInvoice("PAID");
    invoiceFindOne.mockResolvedValue(invoice);
    midtransSays("refund");

    const result = await processSubscriptionInvoiceNotification(ORDER_ID);

    expect(result).toEqual({ applied: true, reason: "status_updated" });
    expect(invoice.status).toBe("REFUNDED");
    expect(invoice.save).toHaveBeenCalled();
  });

  it("is idempotent when the status already matches", async () => {
    const invoice = fakeInvoice("PAID");
    invoiceFindOne.mockResolvedValue(invoice);
    midtransSays("settlement");

    const result = await processSubscriptionInvoiceNotification(ORDER_ID);

    expect(result).toEqual({ applied: true, reason: "idempotent_no_op" });
    expect(invoice.status).toBe("PAID");
    expect(invoice.lastNotificationAt).toBeInstanceOf(Date);
  });

  it("ignores an unrecognized Midtrans status rather than defaulting to PENDING", async () => {
    const invoice = fakeInvoice("PAID");
    invoiceFindOne.mockResolvedValue(invoice);
    midtransSays("some_new_status_midtrans_invented");

    const result = await processSubscriptionInvoiceNotification(ORDER_ID);

    expect(result).toEqual({ applied: false, reason: "unmapped_status" });
    expect(invoice.status).toBe("PAID");
  });

  it("activates the subscription on payment without crashing on ObjectId.save", async () => {
    const invoice = fakeInvoice("PENDING");
    invoiceFindOne.mockResolvedValue(invoice);
    midtransSays("settlement");

    const subscription = {
      status: "PAST_DUE",
      currentPeriodStart: undefined as Date | undefined,
      currentPeriodEnd: undefined as Date | undefined,
      graceEndsAt: new Date("2026-10-05") as Date | undefined,
      save: vi.fn().mockResolvedValue(undefined),
    };
    subscriptionFindById.mockResolvedValue(subscription);

    const result = await processSubscriptionInvoiceNotification(ORDER_ID);

    expect(result).toEqual({ applied: true, reason: "status_updated" });
    expect(invoice.status).toBe("PAID");
    expect(invoice.paidAt).toBeInstanceOf(Date);
    expect(subscriptionFindById).toHaveBeenCalledWith("subscription-1");
    expect(subscription.status).toBe("ACTIVE");
    expect(subscription.currentPeriodEnd).toEqual(invoice.periodEnd);
    expect(subscription.graceEndsAt).toBeUndefined();
    expect(subscription.save).toHaveBeenCalled();
  });

  it("rejects an order id that is not a subscription order", async () => {
    await expect(
      processSubscriptionInvoiceNotification("GRM-20261015-000001"),
    ).rejects.toThrow();
  });
});
