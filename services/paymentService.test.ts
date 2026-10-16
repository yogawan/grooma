// @/services/paymentService.test.ts
//
// Behavior tests for the race between a cancelled transaction and a
// late-arriving Midtrans settlement notification for that same
// transaction (§9.2/§14): the webhook must never mark a cancelled
// transaction PAID or award it loyalty points, no matter which request
// reached MongoDB first. See services/transactionService.test.ts for the
// symmetric cancel-side test.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/mongodb", () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}));

const verifyNotificationSignature = vi.fn().mockReturnValue(true);
const getTransactionStatus = vi.fn();
vi.mock("@/lib/midtrans", () => ({
  verifyNotificationSignature: (...args: unknown[]) =>
    verifyNotificationSignature(...args),
  getTransactionStatus: (...args: unknown[]) => getTransactionStatus(...args),
  createQrisCharge: vi.fn(),
}));

interface FakePaymentDoc {
  _id: string;
  transaction: string;
  providerOrderId: string;
  grossAmount: number;
  status: string;
  paidAt?: Date;
  lastNotificationAt?: Date;
  providerTransactionId?: string;
}

let paymentStore: FakePaymentDoc[] = [];

class FakePayment {
  _id: string;
  transaction: string;
  providerOrderId: string;
  grossAmount: number;
  status: string;
  paidAt?: Date;
  lastNotificationAt?: Date;
  providerTransactionId?: string;

  constructor(doc: FakePaymentDoc) {
    this._id = doc._id;
    this.transaction = doc.transaction;
    this.providerOrderId = doc.providerOrderId;
    this.grossAmount = doc.grossAmount;
    this.status = doc.status;
    this.paidAt = doc.paidAt;
    this.lastNotificationAt = doc.lastNotificationAt;
    this.providerTransactionId = doc.providerTransactionId;
  }

  async save() {
    const idx = paymentStore.findIndex((doc) => doc._id === this._id);
    if (idx !== -1) {
      paymentStore[idx] = { ...this };
    }
    return this;
  }
}

const paymentFindOne = vi.fn((...args: unknown[]) => {
  const [filter] = args as [{ providerOrderId: string }];
  const doc = paymentStore.find(
    (p) => p.providerOrderId === filter.providerOrderId,
  );
  return Promise.resolve(doc ? new FakePayment(doc) : null);
});

vi.mock("@/models/Payment", () => ({
  default: { findOne: (...args: unknown[]) => paymentFindOne(...args) },
}));

interface FakeTransactionDoc {
  _id: string;
  transactionStatus: string;
  paymentStatus: string;
  customer: string | null;
  pointsEarned: number;
}

let transactionStore: FakeTransactionDoc[] = [];

function matchesFilter(
  doc: FakeTransactionDoc,
  filter: Record<string, unknown>,
): boolean {
  for (const [key, cond] of Object.entries(filter)) {
    const value = (doc as unknown as Record<string, unknown>)[key];
    if (cond !== null && typeof cond === "object" && "$ne" in cond) {
      if (value === (cond as { $ne: unknown }).$ne) {
        return false;
      }
      continue;
    }
    if (value !== cond) {
      return false;
    }
  }
  return true;
}

const transactionFindById = vi.fn((...args: unknown[]) => {
  const [id] = args as [string];
  return Promise.resolve(
    transactionStore.find((doc) => doc._id === id) ?? null,
  );
});

const transactionFindOneAndUpdate = vi.fn((...args: unknown[]) => {
  const [filter, update, options] = args as [
    Record<string, unknown>,
    { $set: Record<string, unknown> },
    { new?: boolean }?,
  ];
  const idx = transactionStore.findIndex((doc) => matchesFilter(doc, filter));
  if (idx === -1) {
    return Promise.resolve(null);
  }
  const before = { ...transactionStore[idx] };
  transactionStore[idx] = { ...transactionStore[idx], ...update.$set };
  const after = { ...transactionStore[idx] };
  return Promise.resolve(options?.new ? after : before);
});

vi.mock("@/models/Transaction", () => ({
  default: {
    findById: (...args: unknown[]) => transactionFindById(...args),
    findOneAndUpdate: (...args: unknown[]) =>
      transactionFindOneAndUpdate(...args),
  },
}));

const creditLoyaltyPoints = vi.fn().mockResolvedValue(undefined);
vi.mock("@/services/customerService", () => ({
  creditLoyaltyPoints: (...args: unknown[]) => creditLoyaltyPoints(...args),
}));

const { processMidtransNotification } = await import(
  "@/services/paymentService"
);

function payload() {
  return {
    order_id: "GRM-20261016-000001",
    status_code: "200",
    gross_amount: "25000.00",
    signature_key: "valid",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  verifyNotificationSignature.mockReturnValue(true);
  paymentStore = [
    {
      _id: "pay-1",
      transaction: "txn-1",
      providerOrderId: "GRM-20261016-000001",
      grossAmount: 25000,
      status: "PENDING",
    },
  ];
});

describe("processMidtransNotification vs. a cancelled transaction (late settlement)", () => {
  it("ignores settlement for a transaction already cancelled before the webhook arrived", async () => {
    transactionStore = [
      {
        _id: "txn-1",
        transactionStatus: "CANCELLED",
        paymentStatus: "PENDING",
        customer: "cust-1",
        pointsEarned: 25,
      },
    ];
    getTransactionStatus.mockResolvedValue({
      providerOrderId: "GRM-20261016-000001",
      grossAmount: 25000,
      transactionStatus: "settlement",
      providerTransactionId: "mt-1",
    });

    const result = await processMidtransNotification(payload());

    expect(result).toEqual({
      applied: false,
      reason: "transaction_cancelled",
    });
    expect(creditLoyaltyPoints).not.toHaveBeenCalled();
    // The transaction's own paymentStatus must stay untouched — a
    // cancelled sale never becomes PAID just because money arrived late.
    expect(transactionStore[0].paymentStatus).toBe("PENDING");
    expect(transactionStore[0].transactionStatus).toBe("CANCELLED");
  });

  it("still applies settlement and credits points normally when the transaction was not cancelled", async () => {
    transactionStore = [
      {
        _id: "txn-1",
        transactionStatus: "PENDING",
        paymentStatus: "PENDING",
        customer: "cust-1",
        pointsEarned: 25,
      },
    ];
    getTransactionStatus.mockResolvedValue({
      providerOrderId: "GRM-20261016-000001",
      grossAmount: 25000,
      transactionStatus: "settlement",
      providerTransactionId: "mt-1",
    });

    const result = await processMidtransNotification(payload());

    expect(result).toEqual({ applied: true, reason: "status_updated" });
    expect(creditLoyaltyPoints).toHaveBeenCalledWith("cust-1", 25);
    expect(transactionStore[0].paymentStatus).toBe("PAID");
  });

  it("a duplicate settlement notification for an already-PAID payment never reaches the transaction guard twice", async () => {
    paymentStore[0].status = "PAID";
    transactionStore = [
      {
        _id: "txn-1",
        transactionStatus: "PENDING",
        paymentStatus: "PAID",
        customer: "cust-1",
        pointsEarned: 25,
      },
    ];
    getTransactionStatus.mockResolvedValue({
      providerOrderId: "GRM-20261016-000001",
      grossAmount: 25000,
      transactionStatus: "settlement",
      providerTransactionId: "mt-1",
    });

    const result = await processMidtransNotification(payload());

    expect(result).toEqual({ applied: true, reason: "idempotent_no_op" });
    expect(creditLoyaltyPoints).not.toHaveBeenCalled();
    expect(transactionFindOneAndUpdate).not.toHaveBeenCalled();
  });
});
