// @/lib/idempotency.test.ts
//
// Regression tests for M-6: POST /transactions had no double-submit guard,
// so a double-tapped "charge" button produced two Transaction documents.
//
// The concurrency claim being tested is specifically that the winner is
// decided by the { user, key } unique index rather than a read-then-write
// check — i.e. two simultaneous claims cannot both come back acquired.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/mongodb", () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}));

interface Row {
  key: string;
  user: string;
  transaction: string | null;
}

// Stand-in for the collection, enforcing the unique index the real schema
// declares on { user, key }.
let rows: Row[] = [];

function duplicateKeyError() {
  return Object.assign(new Error("E11000 duplicate key error"), {
    code: 11000,
  });
}

vi.mock("@/models/IdempotencyKey", () => ({
  default: {
    create: vi.fn(async (doc: Row) => {
      if (rows.some((r) => r.user === doc.user && r.key === doc.key)) {
        throw duplicateKeyError();
      }
      rows.push({ ...doc, transaction: doc.transaction ?? null });
      return doc;
    }),
    findOne: vi.fn((filter: { user: string; key: string }) => ({
      select: () => ({
        lean: async () =>
          rows.find((r) => r.user === filter.user && r.key === filter.key) ??
          null,
      }),
    })),
    updateOne: vi.fn(
      async (
        filter: { user: string; key: string },
        update: { $set: { transaction: string } },
      ) => {
        const row = rows.find(
          (r) => r.user === filter.user && r.key === filter.key,
        );
        if (row) {
          row.transaction = update.$set.transaction;
        }
        return { modifiedCount: row ? 1 : 0 };
      },
    ),
    deleteOne: vi.fn(
      async (filter: { user: string; key: string; transaction: null }) => {
        const before = rows.length;
        rows = rows.filter(
          (r) =>
            !(
              r.user === filter.user &&
              r.key === filter.key &&
              r.transaction === null
            ),
        );
        return { deletedCount: before - rows.length };
      },
    ),
  },
}));

const {
  claimIdempotencyKey,
  completeIdempotencyKey,
  isIdempotencyKeyRequired,
  readIdempotencyKey,
  releaseIdempotencyKey,
  MAX_IDEMPOTENCY_KEY_LENGTH,
} = await import("@/lib/idempotency");

beforeEach(() => {
  rows = [];
  vi.clearAllMocks();
});

describe("readIdempotencyKey", () => {
  function headers(value?: string): Headers {
    const h = new Headers();
    if (value !== undefined) {
      h.set("Idempotency-Key", value);
    }
    return h;
  }

  it("returns null when the header is absent", () => {
    expect(readIdempotencyKey(headers())).toBeNull();
  });

  it("trims the value", () => {
    expect(readIdempotencyKey(headers("  abc-123  "))).toBe("abc-123");
  });

  it("treats blank and over-long keys as absent rather than erroring", () => {
    expect(readIdempotencyKey(headers("   "))).toBeNull();
    expect(
      readIdempotencyKey(headers("x".repeat(MAX_IDEMPOTENCY_KEY_LENGTH + 1))),
    ).toBeNull();
  });

  it("accepts a key exactly at the limit", () => {
    const key = "x".repeat(MAX_IDEMPOTENCY_KEY_LENGTH);
    expect(readIdempotencyKey(headers(key))).toBe(key);
  });
});

// Migration path for making the header mandatory (decision 1): each
// deployment flips its own flag once the mobile build pointed at it sends
// the header, so clients already in the field are never broken by a
// platform-wide flag day.
describe("isIdempotencyKeyRequired", () => {
  it("is off unless explicitly enabled, so existing clients keep working", () => {
    delete process.env.REQUIRE_IDEMPOTENCY_KEY;
    expect(isIdempotencyKeyRequired()).toBe(false);
  });

  it('is on only for the exact string "true"', () => {
    process.env.REQUIRE_IDEMPOTENCY_KEY = "true";
    expect(isIdempotencyKeyRequired()).toBe(true);
  });

  it("does not treat other truthy-looking values as enabled", () => {
    for (const value of ["false", "1", "yes", "TRUE", ""]) {
      process.env.REQUIRE_IDEMPOTENCY_KEY = value;
      expect(isIdempotencyKeyRequired()).toBe(false);
    }
  });
});

describe("claimIdempotencyKey", () => {
  it("grants the first caller and refuses the second", async () => {
    const first = await claimIdempotencyKey("k1", "agent-1");
    const second = await claimIdempotencyKey("k1", "agent-1");

    expect(first).toEqual({ acquired: true, completedRefId: null });
    // Still in flight: no recorded transaction yet.
    expect(second).toEqual({ acquired: false, completedRefId: null });
  });

  it("grants exactly one winner under concurrent submits", async () => {
    const results = await Promise.all([
      claimIdempotencyKey("same-key", "agent-1"),
      claimIdempotencyKey("same-key", "agent-1"),
      claimIdempotencyKey("same-key", "agent-1"),
    ]);

    expect(results.filter((r) => r.acquired)).toHaveLength(1);
  });

  it("replays the original ref once the work completed", async () => {
    await claimIdempotencyKey("k2", "agent-1");
    await completeIdempotencyKey("k2", "agent-1", "transaction-99");

    const retry = await claimIdempotencyKey("k2", "agent-1");

    expect(retry).toEqual({
      acquired: false,
      completedRefId: "transaction-99",
    });
  });

  it("scopes keys per user so one agent cannot block another", async () => {
    const a = await claimIdempotencyKey("shared", "agent-1");
    const b = await claimIdempotencyKey("shared", "agent-2");

    expect(a.acquired).toBe(true);
    expect(b.acquired).toBe(true);
  });

  it("frees an in-flight key on release so a retry can proceed", async () => {
    await claimIdempotencyKey("k3", "agent-1");
    await releaseIdempotencyKey("k3", "agent-1");

    const retry = await claimIdempotencyKey("k3", "agent-1");
    expect(retry.acquired).toBe(true);
  });

  it("refuses to release a key whose work already completed", async () => {
    await claimIdempotencyKey("k4", "agent-1");
    await completeIdempotencyKey("k4", "agent-1", "transaction-1");
    await releaseIdempotencyKey("k4", "agent-1");

    // Still spent — releasing must not reopen a completed sale.
    const retry = await claimIdempotencyKey("k4", "agent-1");
    expect(retry).toEqual({
      acquired: false,
      completedRefId: "transaction-1",
    });
  });
});
