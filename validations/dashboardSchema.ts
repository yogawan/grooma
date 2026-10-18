// @/validations/dashboardSchema.ts
import { z } from "zod";

export const PERIOD_ENUM = ["DAY", "WEEK", "MONTH", "YEAR"] as const;
export type Period = (typeof PERIOD_ENUM)[number];

// Shared query params across all dashboard endpoints
const baseDashboardQuerySchema = z
  .object({
    period: z.enum(PERIOD_ENUM).optional().default("MONTH"),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    compare: z.coerce.boolean().optional().default(false),
    // HOST-only filters (AGENT's are ignored/overridden)
    branchId: z.string().min(1).optional(),
    agentId: z.string().min(1).optional(),
  })
  .refine(
    (data) => {
      if (!data.from || !data.to) return true;
      return data.from <= data.to;
    },
    { message: "from must be before or equal to to", path: ["from"] },
  )
  .strict();

export const summaryQuerySchema = baseDashboardQuerySchema;
export type SummaryQuery = z.infer<typeof summaryQuerySchema>;

// Dashboard endpoints are capped, not paginated — paging through a "top N"
// is meaningless. `limit` therefore picks how deep the ranking goes; there is
// no `page`. Every cap below is echoed back in the response so a truncated
// list is distinguishable from a complete one.
export const DASHBOARD_SERVICES_DEFAULT_LIMIT = 10;
export const DASHBOARD_SERVICES_MAX_LIMIT = 50;
export const DASHBOARD_AGENTS_DEFAULT_LIMIT = 50;
export const DASHBOARD_AGENTS_MAX_LIMIT = 100;
export const DASHBOARD_INVENTORY_DEFAULT_LIMIT = 20;
export const DASHBOARD_INVENTORY_MAX_LIMIT = 100;

// Bucket count on /dashboard/revenue is a function of the range the client
// asks for, not of how much data exists — ?period=DAY&from=2015-01-01 would
// have produced thousands of rows from one request. Capped rather than
// truncated: silently dropping the tail of a time series would hand the
// client a chart that looks complete and is not.
export const REVENUE_MAX_BUCKETS = 400;

// Approximate days per bucket. Only used to reject obviously-oversized
// ranges before they reach the database, so month-length variance is
// irrelevant at this precision.
const DAYS_PER_BUCKET: Record<Period, number> = {
  DAY: 1,
  WEEK: 7,
  MONTH: 28,
  YEAR: 365,
};

export function estimateRevenueBuckets(
  period: Period,
  from: Date,
  to: Date,
): number {
  const spanDays = (to.getTime() - from.getTime()) / 86_400_000;
  return Math.ceil(spanDays / DAYS_PER_BUCKET[period]) + 1;
}

// Keyed on `from` alone, not on both bounds: getDateRange() defaults a missing
// `to` to now, so ?period=DAY&from=2015-01-01 spans a decade without ever
// naming an upper bound. Checking `from && to` would have let exactly that
// through. When `from` is absent the derived range is one period wide and
// cannot approach the cap, whatever `to` says.
//
// DAYS_PER_BUCKET rounds months/years down (28, 365), so the estimate errs
// toward over-counting buckets and therefore rejects slightly early — never
// the other way round.
export const revenueQuerySchema = baseDashboardQuerySchema.refine(
  (data) => {
    if (!data.from) return true;
    const to = data.to ?? new Date();
    return (
      estimateRevenueBuckets(data.period, data.from, to) <= REVENUE_MAX_BUCKETS
    );
  },
  {
    message: `The from/to range is too wide for this period: it would produce more than ${REVENUE_MAX_BUCKETS} data points. Narrow the range or use a coarser period.`,
    path: ["to"],
  },
);
export type RevenueQuery = z.infer<typeof revenueQuerySchema>;

export const servicePerformanceQuerySchema = baseDashboardQuerySchema.extend({
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(DASHBOARD_SERVICES_MAX_LIMIT)
    .optional()
    .default(DASHBOARD_SERVICES_DEFAULT_LIMIT),
});
export type ServicePerformanceQuery = z.infer<
  typeof servicePerformanceQuerySchema
>;

export const agentPerformanceQuerySchema = baseDashboardQuerySchema.extend({
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(DASHBOARD_AGENTS_MAX_LIMIT)
    .optional()
    .default(DASHBOARD_AGENTS_DEFAULT_LIMIT),
});
export type AgentPerformanceQuery = z.infer<typeof agentPerformanceQuerySchema>;

export const transactionStatsQuerySchema = baseDashboardQuerySchema;
export type TransactionStatsQuery = z.infer<typeof transactionStatsQuerySchema>;

export const inventoryQuerySchema = z
  .object({
    branchId: z.string().min(1).optional(),
    threshold: z.coerce.number().nonnegative().optional().default(0),
    limit: z.coerce
      .number()
      .int()
      .positive()
      .max(DASHBOARD_INVENTORY_MAX_LIMIT)
      .optional()
      .default(DASHBOARD_INVENTORY_DEFAULT_LIMIT),
  })
  .strict();
export type InventoryQuery = z.infer<typeof inventoryQuerySchema>;
