// @/validations/dashboard.schema.ts
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

export const revenueQuerySchema = baseDashboardQuerySchema;
export type RevenueQuery = z.infer<typeof revenueQuerySchema>;

export const servicePerformanceQuerySchema = baseDashboardQuerySchema;
export type ServicePerformanceQuery = z.infer<
  typeof servicePerformanceQuerySchema
>;

export const agentPerformanceQuerySchema = baseDashboardQuerySchema;
export type AgentPerformanceQuery = z.infer<typeof agentPerformanceQuerySchema>;

export const transactionStatsQuerySchema = baseDashboardQuerySchema;
export type TransactionStatsQuery = z.infer<typeof transactionStatsQuerySchema>;

export const inventoryQuerySchema = z
  .object({
    branchId: z.string().min(1).optional(),
    threshold: z.coerce.number().nonnegative().optional().default(0),
  })
  .strict();
export type InventoryQuery = z.infer<typeof inventoryQuerySchema>;
