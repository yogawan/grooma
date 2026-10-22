// @/services/dashboardService.test.ts
//
// Regression test: GET /dashboard/revenue?period=MONTH (and WEEK) threw a
// bare 500 in production. Root cause was buildPeriodGroupingId's old inline
// version producing { $month: "$createdAt", $year: "$createdAt" } as a
// $group _id expression — MongoDB rejects any expression object with more
// than one operator ($-prefixed) key at execution time with "must have
// exactly one field", which isn't an AppError/ZodError/ValidationError, so
// it fell through to the generic 500 branch in lib/errors.ts. Confirmed
// against the real database before and after the fix.
//
// A mocked TransactionModel.aggregate() would never catch this class of
// bug — it would just return whatever canned data the mock is told to,
// regardless of whether the pipeline is valid MongoDB syntax. So this tests
// the expression SHAPE directly instead: the actual invariant MongoDB
// enforces (at most one $-prefixed key per expression object), not just
// today's four hardcoded periods.

import { describe, expect, it } from "vitest";
import {
  buildPeriodGroupingId,
  fillPaymentBreakdown,
} from "@/services/dashboardService";
import type { Period } from "@/validations/dashboardSchema";

// Mirrors the real constraint: an object representing a MongoDB expression
// may have at most one field whose name starts with "$". Checked one level
// deep too, since { year: { $year: ..., $foo: ... } } would be an equally
// invalid nested expression.
function assertAtMostOneOperatorPerObject(value: unknown): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return;
  }

  const keys = Object.keys(value as Record<string, unknown>);
  const operatorKeys = keys.filter((k) => k.startsWith("$"));

  expect(operatorKeys.length).toBeLessThanOrEqual(1);

  for (const key of keys) {
    assertAtMostOneOperatorPerObject((value as Record<string, unknown>)[key]);
  }
}

describe("buildPeriodGroupingId", () => {
  it.each<Period>([
    "DAY",
    "WEEK",
    "MONTH",
    "YEAR",
  ])("never produces an expression object with more than one operator key (%s)", (period) => {
    assertAtMostOneOperatorPerObject(buildPeriodGroupingId(period));
  });

  it("DAY groups by a single $dateToString expression", () => {
    expect(buildPeriodGroupingId("DAY")).toEqual({
      $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
    });
  });

  it("WEEK groups by year and week, each under its own plain field name", () => {
    expect(buildPeriodGroupingId("WEEK")).toEqual({
      year: { $year: "$createdAt" },
      week: { $week: "$createdAt" },
    });
  });

  it("MONTH groups by year and month, each under its own plain field name", () => {
    expect(buildPeriodGroupingId("MONTH")).toEqual({
      year: { $year: "$createdAt" },
      month: { $month: "$createdAt" },
    });
  });

  it("YEAR groups by a single $year expression", () => {
    expect(buildPeriodGroupingId("YEAR")).toEqual({
      $year: "$createdAt",
    });
  });
});

describe("fillPaymentBreakdown", () => {
  it("passes both methods through unchanged when both have data", () => {
    const rows = [
      { _id: "CASH", count: 20, revenue: 2100000 },
      { _id: "QRIS", count: 18, revenue: 2150000 },
    ];

    expect(fillPaymentBreakdown(rows)).toEqual(rows);
  });

  it("zero-fills QRIS when only CASH has transactions", () => {
    const rows = [{ _id: "CASH", count: 20, revenue: 2100000 }];

    expect(fillPaymentBreakdown(rows)).toEqual([
      { _id: "CASH", count: 20, revenue: 2100000 },
      { _id: "QRIS", count: 0, revenue: 0 },
    ]);
  });

  it("zero-fills CASH when only QRIS has transactions", () => {
    const rows = [{ _id: "QRIS", count: 18, revenue: 2150000 }];

    expect(fillPaymentBreakdown(rows)).toEqual([
      { _id: "CASH", count: 0, revenue: 0 },
      { _id: "QRIS", count: 18, revenue: 2150000 },
    ]);
  });

  it("zero-fills both when there are no transactions at all", () => {
    expect(fillPaymentBreakdown([])).toEqual([
      { _id: "CASH", count: 0, revenue: 0 },
      { _id: "QRIS", count: 0, revenue: 0 },
    ]);
  });

  it("always returns CASH before QRIS regardless of input order", () => {
    const rows = [
      { _id: "QRIS", count: 18, revenue: 2150000 },
      { _id: "CASH", count: 20, revenue: 2100000 },
    ];

    expect(fillPaymentBreakdown(rows).map((row) => row._id)).toEqual([
      "CASH",
      "QRIS",
    ]);
  });
});
