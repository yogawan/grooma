// @/lib/pagination.test.ts
//
// The contract in docs/PAGINATION-CONTRACT.md is only worth writing down if
// something fails when an endpoint drifts from it. Two things here do that:
// the uniformity suite at the bottom, which fails when a new list endpoint
// invents its own bounds, and the stableSort tests, which pin the tie-breaker
// that makes offset paging correct at all.
//
// No database is involved: everything under test is pure, and paginateQueries
// is exercised with plain resolved promises rather than a mocked Mongoose
// query, which would only prove the mock was configured as expected.

import { describe, expect, it } from "vitest";
import {
  buildPaginationMeta,
  PAGINATION_DEFAULT_LIMIT,
  PAGINATION_MAX_LIMIT,
  paginateQueries,
  paginationQuerySchema,
  paginationSkip,
  stableSort,
  toPaginated,
} from "@/lib/pagination";
import { listChangeRequestsQuerySchema } from "@/validations/approvalSchema";
import { listBranchesQuerySchema } from "@/validations/branchSchema";
import { listCustomersQuerySchema } from "@/validations/customerSchema";
import {
  listInventoryQuerySchema,
  listStockMovementsQuerySchema,
} from "@/validations/inventorySchema";
import { listServicesQuerySchema } from "@/validations/serviceSchema";
import { listSubscriptionInvoicesQuerySchema } from "@/validations/subscriptionSchema";
import { listTransactionsQuerySchema } from "@/validations/transactionSchema";
import { listUsersQuerySchema } from "@/validations/userSchema";

describe("paginationQuerySchema", () => {
  it("defaults to page 1 and the default limit when absent", () => {
    expect(paginationQuerySchema.parse({})).toEqual({
      page: 1,
      limit: PAGINATION_DEFAULT_LIMIT,
    });
  });

  it("coerces the strings that a query string always delivers", () => {
    expect(paginationQuerySchema.parse({ page: "3", limit: "50" })).toEqual({
      page: 3,
      limit: 50,
    });
  });

  it.each([
    ["page 0", { page: 0 }],
    ["negative page", { page: -1 }],
    ["non-numeric page", { page: "abc" }],
    ["fractional page", { page: 1.5 }],
    ["limit 0", { limit: 0 }],
    ["limit above the max", { limit: PAGINATION_MAX_LIMIT + 1 }],
    ["non-numeric limit", { limit: "abc" }],
    ["fractional limit", { limit: 10.5 }],
  ])("rejects %s", (_label, input) => {
    expect(paginationQuerySchema.safeParse(input).success).toBe(false);
  });

  it.each([
    ["the lowest page", { page: 1 }],
    ["the lowest limit", { limit: 1 }],
    ["the maximum limit", { limit: PAGINATION_MAX_LIMIT }],
  ])("accepts %s", (_label, input) => {
    expect(paginationQuerySchema.safeParse(input).success).toBe(true);
  });

  // §2.3 — there must be no way for a client to ask for the whole collection.
  it.each([
    "all",
    "-1",
    "0",
    "none",
    "1e9",
  ])("offers no escape hatch via limit=%s", (limit) => {
    const result = paginationQuerySchema.safeParse({ limit });
    if (result.success) {
      expect(result.data.limit).toBeLessThanOrEqual(PAGINATION_MAX_LIMIT);
    }
  });
});

describe("paginationSkip", () => {
  it("is 0 on the first page", () => {
    expect(paginationSkip({ page: 1, limit: 20 })).toBe(0);
  });

  it("advances by a full limit per page", () => {
    expect(paginationSkip({ page: 2, limit: 20 })).toBe(20);
    expect(paginationSkip({ page: 7, limit: 25 })).toBe(150);
  });
});

describe("buildPaginationMeta", () => {
  it("computes totalPages by rounding up a partial last page", () => {
    expect(buildPaginationMeta({ page: 1, limit: 20 }, 137)).toEqual({
      page: 1,
      limit: 20,
      total: 137,
      totalPages: 7,
    });
  });

  it("reports totalPages 0 for an empty result rather than a phantom page", () => {
    expect(buildPaginationMeta({ page: 1, limit: 20 }, 0)).toEqual({
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
    });
  });

  it("does not round up when the last page is exactly full", () => {
    expect(buildPaginationMeta({ page: 1, limit: 20 }, 40).totalPages).toBe(2);
  });

  // §3.3 — the client needs to see the page it asked for next to totalPages
  // in order to correct an overshoot. Clamping would hide the mistake.
  it("echoes an out-of-range page back instead of clamping it", () => {
    expect(buildPaginationMeta({ page: 99, limit: 20 }, 137)).toEqual({
      page: 99,
      limit: 20,
      total: 137,
      totalPages: 7,
    });
  });

  // §9.1 — the whole reason this module exists.
  it("names the fourth field totalPages, never pages", () => {
    const meta = buildPaginationMeta({ page: 1, limit: 20 }, 5);
    expect(Object.keys(meta).sort()).toEqual([
      "limit",
      "page",
      "total",
      "totalPages",
    ]);
  });
});

describe("toPaginated / paginateQueries", () => {
  it("pairs the rows with their metadata", () => {
    expect(toPaginated(["a", "b"], { page: 1, limit: 20 }, 2)).toEqual({
      items: ["a", "b"],
      pagination: { page: 1, limit: 20, total: 2, totalPages: 1 },
    });
  });

  it("keeps all four pagination fields on an empty page", async () => {
    const result = await paginateQueries(
      Promise.resolve([]),
      Promise.resolve(0),
      { page: 1, limit: 20 },
    );

    expect(result.items).toEqual([]);
    expect(result.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
    });
  });

  // total counts the whole filtered set, not the rows on this page — the
  // distinction the mobile client's "page X of Y" depends on.
  it("takes total from the count query, not the row count", async () => {
    const result = await paginateQueries(
      Promise.resolve([1, 2, 3]),
      Promise.resolve(137),
      { page: 1, limit: 3 },
    );

    expect(result.items).toHaveLength(3);
    expect(result.pagination.total).toBe(137);
    expect(result.pagination.totalPages).toBe(46);
  });

  it("runs the row and count queries concurrently", async () => {
    const started: string[] = [];
    const rows = (async () => {
      started.push("rows");
      await new Promise((r) => setTimeout(r, 5));
      return ["x"];
    })();
    const count = (async () => {
      started.push("count");
      return 1;
    })();

    await paginateQueries(rows, count, { page: 1, limit: 20 });
    // Both were in flight before either resolved; a sequential await would
    // have pushed "count" only after rows' timeout elapsed.
    expect(started).toEqual(["rows", "count"]);
  });
});

describe("stableSort", () => {
  it("appends _id so the ordering is total, not just by the primary key", () => {
    expect(stableSort({ createdAt: -1 })).toEqual({ createdAt: -1, _id: -1 });
  });

  it("matches _id's direction to the last key, keeping the order intuitive", () => {
    expect(stableSort({ name: 1 })).toEqual({ name: 1, _id: 1 });
  });

  it("preserves multi-key sorts and their key order", () => {
    expect(Object.keys(stableSort({ a: 1, b: -1 }))).toEqual(["a", "b", "_id"]);
  });

  it("handles a dotted path key", () => {
    expect(stableSort({ "changeRequest.requestedAt": -1 })).toEqual({
      "changeRequest.requestedAt": -1,
      _id: -1,
    });
  });

  it("does not mutate the spec it is given", () => {
    const spec = { createdAt: -1 as const };
    stableSort(spec);
    expect(spec).toEqual({ createdAt: -1 });
  });
});

// This is the suite that earns its keep over time: a new list endpoint that
// hand-rolls `page`/`limit` instead of spreading paginationQueryFields will
// fail here the moment it is added to the table, which is exactly how the
// pages-vs-totalPages divergence went unnoticed for a release.
describe("every list-query schema shares one pagination shape", () => {
  const schemas = {
    transactions: listTransactionsQuerySchema,
    inventory: listInventoryQuerySchema,
    stockMovements: listStockMovementsQuerySchema,
    changeRequests: listChangeRequestsQuerySchema,
    subscriptionInvoices: listSubscriptionInvoicesQuerySchema,
    branches: listBranchesQuerySchema,
    customers: listCustomersQuerySchema,
    services: listServicesQuerySchema,
    users: listUsersQuerySchema,
  };

  const names = Object.keys(schemas) as (keyof typeof schemas)[];

  it("covers every list-query schema in validations/", () => {
    // Guards against the table silently falling behind the codebase.
    expect(names).toHaveLength(9);
  });

  it.each(names)("%s: same defaults", (name) => {
    const parsed = schemas[name].parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.limit).toBe(PAGINATION_DEFAULT_LIMIT);
  });

  it.each(names)("%s: same upper bound", (name) => {
    expect(
      schemas[name].safeParse({ limit: PAGINATION_MAX_LIMIT }).success,
    ).toBe(true);
    expect(
      schemas[name].safeParse({ limit: PAGINATION_MAX_LIMIT + 1 }).success,
    ).toBe(false);
  });

  it.each(names)("%s: same lower bound", (name) => {
    expect(schemas[name].safeParse({ page: 0 }).success).toBe(false);
    expect(schemas[name].safeParse({ limit: 0 }).success).toBe(false);
  });

  it.each(names)("%s: coerces query-string values", (name) => {
    const parsed = schemas[name].parse({ page: "2", limit: "5" });
    expect(parsed).toMatchObject({ page: 2, limit: 5 });
  });

  // Query strings legitimately carry params the server does not own (cache
  // busters, analytics tags). Bodies are where .strict() belongs; a list
  // query that 400s on an unrelated param would be a client-breaking trap.
  it.each(names)("%s: ignores unknown params rather than rejecting", (name) => {
    expect(schemas[name].safeParse({ _cacheBust: "1" }).success).toBe(true);
  });
});

// Regression guard for the one place this rollout could have broken a live
// client: /customers previously read `search` straight off searchParams, so a
// cleared search box sending ?search= meant "no filter". Validating it with a
// bare .min(1) would have turned that into a 400 on the POS customer lookup.
describe("listCustomersQuerySchema search compatibility", () => {
  it.each([
    "",
    "   ",
  ])("treats a blank search (%j) as absent, not invalid", (search) => {
    const parsed = listCustomersQuerySchema.parse({ search });
    expect(parsed.search).toBeUndefined();
  });

  it("still trims and keeps a real term", () => {
    expect(listCustomersQuerySchema.parse({ search: "  budi " }).search).toBe(
      "budi",
    );
  });

  it("rejects an unbounded term", () => {
    expect(
      listCustomersQuerySchema.safeParse({ search: "x".repeat(101) }).success,
    ).toBe(false);
  });
});
