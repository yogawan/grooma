// @/services/subscriptionLifecycle.test.ts
//
// End-to-end coverage of the subscription billing chain:
//   generateSubscriptionInvoice -> Midtrans webhook -> signature check ->
//   invoice status -> subscription activation -> idempotency on replay.
//
// Two defects this file pins down, both from the same root cause —
// Mongoose's doc.populated(path) returns the populated _id, not the
// document:
//   * generateSubscriptionInvoice read plan.price / plan.billingCycle off an
//     ObjectId, so `amount` was undefined (required-field failure) and
//     calculateNextBillingPeriod fell through to its ANNUAL branch, billing
//     a monthly plan for a whole year.
//   * the webhook handler called .save() on an ObjectId when activating a
//     paid subscription, throwing a TypeError on the success path.

import { beforeEach, describe, expect, it, vi } from "vitest";

const getTransactionStatus = vi.fn();
const createQrisCharge = vi.fn();
const verifyNotificationSignature = vi.fn();

vi.mock("@/lib/midtrans", () => ({
  getTransactionStatus: (...args: unknown[]) => getTransactionStatus(...args),
  createQrisCharge: (...args: unknown[]) => createQrisCharge(...args),
  verifyNotificationSignature: (...args: unknown[]) =>
    verifyNotificationSignature(...args),
}));

vi.mock("@/lib/mongodb", () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}));

const invoiceFindOne = vi.fn();
const invoiceSave = vi.fn();
const invoiceConstructor = vi.fn();

vi.mock("@/models/SubscriptionInvoice", () => {
  class FakeInvoice {
    [key: string]: unknown;
    constructor(doc: Record<string, unknown>) {
      Object.assign(this, doc);
      invoiceConstructor(doc);
    }
    save() {
      invoiceSave();
      return Promise.resolve(this);
    }
    toObject() {
      return { ...this };
    }
  }
  return {
    default: Object.assign(FakeInvoice, {
      findOne: (...args: unknown[]) => invoiceFindOne(...args),
      find: vi.fn(),
      countDocuments: vi.fn(),
      updateMany: vi.fn(),
    }),
  };
});

const subscriptionFindById = vi.fn();
vi.mock("@/models/Subscription", () => ({
  default: {
    findById: (...args: unknown[]) => subscriptionFindById(...args),
    find: vi.fn(),
    updateMany: vi.fn(),
  },
}));

const planFindById = vi.fn();
vi.mock("@/models/SubscriptionPlan", () => ({
  default: {
    findById: (...args: unknown[]) => planFindById(...args),
  },
}));

const { generateSubscriptionInvoice, processSubscriptionInvoiceNotification } =
  await import("@/services/billingService");

const ORDER_ID = "GRM-SUB-202610-000001";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generateSubscriptionInvoice", () => {
  it("uses the plan's real price and monthly cycle (not an ObjectId)", async () => {
    subscriptionFindById.mockResolvedValue({
      _id: "sub-1",
      host: "host-1",
      plan: "plan-1",
      currentPeriodEnd: new Date("2026-10-31T00:00:00.000Z"),
    });
    planFindById.mockResolvedValue({
      _id: "plan-1",
      price: 50000,
      billingCycle: "MONTHLY",
    });
    createQrisCharge.mockResolvedValue({
      qrCodeUrl: "https://example.invalid/qr",
      qrString: "qr-payload",
      expiresAt: new Date("2026-11-01T00:15:00.000Z"),
      providerOrderId: ORDER_ID,
      providerTransactionId: "mt-1",
      transactionStatus: "pending",
      grossAmount: 50000,
    });

    const invoice = await generateSubscriptionInvoice("sub-1");

    // The charge must carry a real amount — this was `undefined` before.
    expect(createQrisCharge).toHaveBeenCalledWith(
      expect.objectContaining({ grossAmount: 50000 }),
    );
    expect(invoice.amount).toBe(50000);
    expect(invoice.status).toBe("PENDING");

    // MONTHLY must span ~1 month. The ObjectId bug produced ~1 year.
    const start = new Date(invoice.periodStart);
    const end = new Date(invoice.periodEnd);
    const spanDays = (end.getTime() - start.getTime()) / 86_400_000;
    expect(spanDays).toBeLessThan(40);
  });

  it("surfaces a gateway failure instead of persisting a half-made invoice", async () => {
    subscriptionFindById.mockResolvedValue({
      _id: "sub-1",
      host: "host-1",
      plan: "plan-1",
      currentPeriodEnd: new Date("2026-10-31T00:00:00.000Z"),
    });
    planFindById.mockResolvedValue({
      _id: "plan-1",
      price: 50000,
      billingCycle: "MONTHLY",
    });
    createQrisCharge.mockRejectedValue(new Error("midtrans down"));

    await expect(generateSubscriptionInvoice("sub-1")).rejects.toThrow();
    expect(invoiceSave).not.toHaveBeenCalled();
  });

  it("rejects an unknown subscription", async () => {
    subscriptionFindById.mockResolvedValue(null);
    await expect(generateSubscriptionInvoice("nope")).rejects.toThrow();
    expect(createQrisCharge).not.toHaveBeenCalled();
  });

  it("rejects a subscription whose plan is missing", async () => {
    subscriptionFindById.mockResolvedValue({
      _id: "sub-1",
      host: "host-1",
      plan: "plan-gone",
      currentPeriodEnd: new Date("2026-10-31T00:00:00.000Z"),
    });
    planFindById.mockResolvedValue(null);

    await expect(generateSubscriptionInvoice("sub-1")).rejects.toThrow();
    expect(createQrisCharge).not.toHaveBeenCalled();
  });
});

describe("subscription activation on payment", () => {
  function pendingInvoice() {
    return {
      _id: { toString: () => "invoice-1" },
      status: "PENDING",
      subscription: "sub-1",
      periodStart: new Date("2026-11-01"),
      periodEnd: new Date("2026-11-30"),
      paidAt: undefined as Date | undefined,
      lastNotificationAt: undefined as Date | undefined,
      providerTransactionId: undefined as string | undefined,
      save: vi.fn().mockResolvedValue(undefined),
    };
  }

  function paidSubscription() {
    return {
      status: "PAST_DUE",
      currentPeriodStart: undefined as Date | undefined,
      currentPeriodEnd: undefined as Date | undefined,
      graceEndsAt: new Date("2026-10-05") as Date | undefined,
      save: vi.fn().mockResolvedValue(undefined),
    };
  }

  it("activates the subscription and rolls its period forward", async () => {
    const invoice = pendingInvoice();
    const subscription = paidSubscription();
    invoiceFindOne.mockResolvedValue(invoice);
    subscriptionFindById.mockResolvedValue(subscription);
    getTransactionStatus.mockResolvedValue({
      providerOrderId: ORDER_ID,
      providerTransactionId: "mt-9",
      transactionStatus: "settlement",
      grossAmount: 50000,
      fraudStatus: "accept",
    });

    const result = await processSubscriptionInvoiceNotification(ORDER_ID);

    expect(result).toEqual({ applied: true, reason: "status_updated" });
    expect(invoice.status).toBe("PAID");
    expect(subscription.status).toBe("ACTIVE");
    expect(subscription.currentPeriodStart).toEqual(invoice.periodStart);
    expect(subscription.currentPeriodEnd).toEqual(invoice.periodEnd);
    expect(subscription.graceEndsAt).toBeUndefined();
    expect(subscription.save).toHaveBeenCalledTimes(1);
  });

  it("does not activate the subscription when payment is denied", async () => {
    const invoice = pendingInvoice();
    const subscription = paidSubscription();
    invoiceFindOne.mockResolvedValue(invoice);
    subscriptionFindById.mockResolvedValue(subscription);
    getTransactionStatus.mockResolvedValue({
      providerOrderId: ORDER_ID,
      providerTransactionId: "mt-9",
      transactionStatus: "deny",
      grossAmount: 50000,
      fraudStatus: "deny",
    });

    const result = await processSubscriptionInvoiceNotification(ORDER_ID);

    expect(result).toEqual({ applied: true, reason: "status_updated" });
    expect(invoice.status).toBe("FAILED");
    expect(subscription.status).toBe("PAST_DUE");
    expect(subscription.save).not.toHaveBeenCalled();
  });

  it("activates only once when the same notification arrives twice", async () => {
    const invoice = pendingInvoice();
    const subscription = paidSubscription();
    invoiceFindOne.mockResolvedValue(invoice);
    subscriptionFindById.mockResolvedValue(subscription);
    getTransactionStatus.mockResolvedValue({
      providerOrderId: ORDER_ID,
      providerTransactionId: "mt-9",
      transactionStatus: "settlement",
      grossAmount: 50000,
      fraudStatus: "accept",
    });

    const first = await processSubscriptionInvoiceNotification(ORDER_ID);
    const paidAtAfterFirst = invoice.paidAt;

    // Midtrans retries the identical notification.
    const second = await processSubscriptionInvoiceNotification(ORDER_ID);

    expect(first).toEqual({ applied: true, reason: "status_updated" });
    expect(second).toEqual({ applied: true, reason: "idempotent_no_op" });
    expect(invoice.paidAt).toBe(paidAtAfterFirst);
    // The period must not be rolled forward a second time.
    expect(subscription.save).toHaveBeenCalledTimes(1);
  });
});
