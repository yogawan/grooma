// @/validations/dashboardSchema.test.ts
//
// Dashboard endpoints are capped rather than paginated (docs/PAGINATION-CONTRACT
// §6), so the thing worth testing is the cap itself: that a wide range is
// refused before it reaches the database, and that the per-endpoint limits
// have the bounds the contract claims.
//
// The revenue range check is the one with a real trap in it. An earlier draft
// keyed it on `from && to`, which looked right and was not: getDateRange()
// defaults a missing `to` to now, so ?period=DAY&from=2015-01-01 sails past a
// both-bounds-present check and still asks for a decade of daily buckets.

import { describe, expect, it } from "vitest";
import {
  agentPerformanceQuerySchema,
  DASHBOARD_AGENTS_DEFAULT_LIMIT,
  DASHBOARD_AGENTS_MAX_LIMIT,
  DASHBOARD_INVENTORY_DEFAULT_LIMIT,
  DASHBOARD_INVENTORY_MAX_LIMIT,
  DASHBOARD_SERVICES_DEFAULT_LIMIT,
  DASHBOARD_SERVICES_MAX_LIMIT,
  estimateRevenueBuckets,
  inventoryQuerySchema,
  type Period,
  REVENUE_MAX_BUCKETS,
  revenueQuerySchema,
  servicePerformanceQuerySchema,
  summaryQuerySchema,
} from "@/validations/dashboardSchema";

const iso = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe("estimateRevenueBuckets", () => {
  it.each<[Period, string, string, number]>([
    ["DAY", "2026-01-01", "2026-01-08", 8],
    ["WEEK", "2026-01-01", "2026-03-01", 10],
    // 6 calendar years spans 2192 days once 2020's and 2024's leap days are
    // counted, so ceil(2192/365) is 7 rather than 6, +1 for the inclusive
    // final bucket. The over-count is the intended direction of error.
    ["YEAR", "2020-01-01", "2026-01-01", 8],
  ])("%s over %s..%s is about %i buckets", (period, from, to, expected) => {
    expect(estimateRevenueBuckets(period, iso(from), iso(to))).toBe(expected);
  });

  // Months are treated as 28 days and years as 365, so the estimate leans
  // toward over-counting and therefore rejects slightly early — never the
  // other way round, which would let an oversized range through.
  it("never under-counts monthly buckets", () => {
    const actualMonths = 12;
    expect(
      estimateRevenueBuckets("MONTH", iso("2026-01-01"), iso("2027-01-01")),
    ).toBeGreaterThanOrEqual(actualMonths);
  });
});

describe("revenueQuerySchema range cap", () => {
  it("accepts a request with no explicit range (the service derives a narrow one)", () => {
    expect(revenueQuerySchema.safeParse({ period: "DAY" }).success).toBe(true);
  });

  it("accepts a range that stays within the bucket cap", () => {
    expect(
      revenueQuerySchema.safeParse({
        period: "DAY",
        from: "2026-01-01",
        to: "2026-03-01",
      }).success,
    ).toBe(true);
  });

  it("rejects a decade of daily buckets", () => {
    const result = revenueQuerySchema.safeParse({
      period: "DAY",
      from: "2015-01-01",
      to: "2026-12-31",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain(
      String(REVENUE_MAX_BUCKETS),
    );
  });

  // The regression this file exists for.
  it("rejects an open-ended `from` with no `to` — `to` defaults to now", () => {
    expect(
      revenueQuerySchema.safeParse({ period: "DAY", from: "2015-01-01" })
        .success,
    ).toBe(false);
  });

  it("accepts the same wide span at a coarser period", () => {
    expect(
      revenueQuerySchema.safeParse({
        period: "YEAR",
        from: "2015-01-01",
        to: "2026-12-31",
      }).success,
    ).toBe(true);
  });

  it("still enforces the inherited from<=to ordering check", () => {
    expect(
      revenueQuerySchema.safeParse({
        period: "MONTH",
        from: "2026-06-01",
        to: "2026-01-01",
      }).success,
    ).toBe(false);
  });

  it("still rejects unknown params (strictness survives the added check)", () => {
    expect(
      revenueQuerySchema.safeParse({ period: "DAY", nope: 1 }).success,
    ).toBe(false);
  });
});

describe("dashboard limit params", () => {
  it.each([
    [
      "services",
      servicePerformanceQuerySchema,
      DASHBOARD_SERVICES_DEFAULT_LIMIT,
      DASHBOARD_SERVICES_MAX_LIMIT,
    ],
    [
      "agents",
      agentPerformanceQuerySchema,
      DASHBOARD_AGENTS_DEFAULT_LIMIT,
      DASHBOARD_AGENTS_MAX_LIMIT,
    ],
    [
      "inventory",
      inventoryQuerySchema,
      DASHBOARD_INVENTORY_DEFAULT_LIMIT,
      DASHBOARD_INVENTORY_MAX_LIMIT,
    ],
  ] as const)("%s: defaults to %i and caps at %i", (_n, schema, def, max) => {
    expect(schema.parse({}).limit).toBe(def);
    expect(schema.safeParse({ limit: max }).success).toBe(true);
    expect(schema.safeParse({ limit: max + 1 }).success).toBe(false);
    expect(schema.safeParse({ limit: 0 }).success).toBe(false);
    expect(schema.parse({ limit: "3" }).limit).toBe(3);
  });

  // These are rankings and worklists, not pages — `page` would imply you can
  // walk past the cap, which is exactly what the cap exists to prevent.
  it.each([
    ["services", servicePerformanceQuerySchema],
    ["agents", agentPerformanceQuerySchema],
    ["inventory", inventoryQuerySchema],
  ] as const)("%s: offers no page param", (_n, schema) => {
    expect(schema.safeParse({ page: 2 }).success).toBe(false);
  });

  it("leaves the non-ranking endpoints without a limit param", () => {
    // summary returns a single object and transactions is bounded by enum
    // cardinality, so neither has anything to cap.
    expect(summaryQuerySchema.safeParse({ limit: 10 }).success).toBe(false);
  });
});
