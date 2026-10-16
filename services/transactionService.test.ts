// @/services/transactionService.test.ts
//
// Behavior tests for loyalty-point reversal on cancellation (§5.3): a
// cancelled transaction that was PAID must have its pointsEarned subtracted
// back from the customer, exactly once. The cancel transition itself uses
// an atomic, conditional findOneAndUpdate (not read-modify-write) so it
// can't race a concurrent Midtrans webhook settling the same transaction —
// see services/paymentService.test.ts for the symmetric webhook-side test.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/lib/auth";

vi.mock("@/lib/mongodb", () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}));

interface FakeTransactionDoc {
  _id: string;
  branch: string;
  customer: string | null;
  transactionStatus: string;
  paymentStatus: string;
  pointsEarned: number;
}

let store: FakeTransactionDoc[] = [];

function matchesFilter(
  doc: FakeTransactionDoc,
  filter: Record<string, unknown>,
): boolean {
  for (const [key, cond] of Object.entries(filter)) {
    const value = (doc as unknown as Record<string, unknown>)[key];
    if (cond !== null && typeof cond === "object" && "$nin" in cond) {
      if ((cond as { $nin: unknown[] }).$nin.includes(value)) {
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
  return Promise.resolve(store.find((doc) => doc._id === id) ?? null);
});

// Mirrors real MongoDB findOneAndUpdate semantics just enough to test the
// atomicity guarantee this code relies on: a filter that doesn't match
// (e.g. transactionStatus already CANCELLED) returns null rather than
// mutating anything.
const transactionFindOneAndUpdate = vi.fn((...args: unknown[]) => {
  const [filter, update, options] = args as [
    Record<string, unknown>,
    { $set: Record<string, unknown> },
    { new?: boolean }?,
  ];
  const idx = store.findIndex((doc) => matchesFilter(doc, filter));
  if (idx === -1) {
    return Promise.resolve(null);
  }
  const before = { ...store[idx] };
  store[idx] = { ...store[idx], ...update.$set };
  const after = { ...store[idx] };
  return Promise.resolve(options?.new ? after : before);
});

vi.mock("@/models/Transaction", () => ({
  default: {
    findById: (...args: unknown[]) => transactionFindById(...args),
    findOneAndUpdate: (...args: unknown[]) =>
      transactionFindOneAndUpdate(...args),
  },
}));

const reverseLoyaltyPoints = vi.fn().mockResolvedValue(undefined);
const creditLoyaltyPoints = vi.fn().mockResolvedValue(undefined);
vi.mock("@/services/customerService", () => ({
  reverseLoyaltyPoints: (...args: unknown[]) => reverseLoyaltyPoints(...args),
  creditLoyaltyPoints: (...args: unknown[]) => creditLoyaltyPoints(...args),
}));

const { cancelTransaction } = await import("@/services/transactionService");

const HOST: SessionUser = {
  id: "host-1",
  username: "host",
  name: "Host",
  role: "HOST",
  branch: null,
  status: "ACTIVE",
};

beforeEach(() => {
  vi.clearAllMocks();
  store = [];
});

describe("cancelTransaction loyalty point reversal", () => {
  it("reverses pointsEarned when cancelling a PAID transaction with a customer", async () => {
    store = [
      {
        _id: "txn-1",
        branch: "branch-1",
        customer: "cust-1",
        transactionStatus: "PENDING",
        paymentStatus: "PAID",
        pointsEarned: 25,
      },
    ];

    await cancelTransaction(HOST, "txn-1");

    expect(reverseLoyaltyPoints).toHaveBeenCalledWith("cust-1", 25);
    expect(store[0].transactionStatus).toBe("CANCELLED");
  });

  it("does not reverse points when the transaction was never PAID", async () => {
    store = [
      {
        _id: "txn-2",
        branch: "branch-1",
        customer: "cust-1",
        transactionStatus: "PENDING",
        paymentStatus: "PENDING",
        pointsEarned: 25,
      },
    ];

    await cancelTransaction(HOST, "txn-2");

    expect(reverseLoyaltyPoints).not.toHaveBeenCalled();
    expect(store[0].transactionStatus).toBe("CANCELLED");
  });

  it("does not reverse points when there is no customer on the transaction", async () => {
    store = [
      {
        _id: "txn-3",
        branch: "branch-1",
        customer: null,
        transactionStatus: "PENDING",
        paymentStatus: "PAID",
        pointsEarned: 25,
      },
    ];

    await cancelTransaction(HOST, "txn-3");

    expect(reverseLoyaltyPoints).not.toHaveBeenCalled();
  });

  it("rejects cancelling an already-cancelled transaction and does not reverse points", async () => {
    store = [
      {
        _id: "txn-4",
        branch: "branch-1",
        customer: "cust-1",
        transactionStatus: "CANCELLED",
        paymentStatus: "PAID",
        pointsEarned: 25,
      },
    ];

    await expect(cancelTransaction(HOST, "txn-4")).rejects.toThrow(
      /already cancelled/,
    );
    expect(reverseLoyaltyPoints).not.toHaveBeenCalled();
  });

  it("double reversal: a second cancel attempt after a successful one never reverses twice", async () => {
    store = [
      {
        _id: "txn-5",
        branch: "branch-1",
        customer: "cust-1",
        transactionStatus: "PENDING",
        paymentStatus: "PAID",
        pointsEarned: 25,
      },
    ];

    await cancelTransaction(HOST, "txn-5");
    expect(reverseLoyaltyPoints).toHaveBeenCalledTimes(1);

    await expect(cancelTransaction(HOST, "txn-5")).rejects.toThrow(
      /already cancelled/,
    );
    expect(reverseLoyaltyPoints).toHaveBeenCalledTimes(1);
  });

  it("rejects cancelling a completed transaction without touching points", async () => {
    store = [
      {
        _id: "txn-6",
        branch: "branch-1",
        customer: "cust-1",
        transactionStatus: "COMPLETED",
        paymentStatus: "PAID",
        pointsEarned: 25,
      },
    ];

    await expect(cancelTransaction(HOST, "txn-6")).rejects.toThrow(
      /Cannot cancel a completed transaction/,
    );
    expect(reverseLoyaltyPoints).not.toHaveBeenCalled();
    expect(store[0].transactionStatus).toBe("COMPLETED");
  });
});
