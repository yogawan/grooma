// @/validations/subscriptionSchema.ts
import { z } from "zod";

export const createSubscriptionPlanSchema = z
  .object({
    code: z.string().trim().min(1).max(32),
    name: z.string().trim().min(1).max(100),
    description: z.string().trim().max(500).optional(),
    price: z.number().nonnegative(),
    currency: z.enum(["IDR", "USD"]).default("IDR"),
    billingCycle: z.enum(["MONTHLY", "ANNUAL"]).default("MONTHLY"),
    graceDays: z.number().int().min(0).max(30).default(3),
    maxBranches: z.number().int().min(1).default(1),
  })
  .strict();
export type CreateSubscriptionPlanInput = z.infer<
  typeof createSubscriptionPlanSchema
>;

export const updateSubscriptionPlanSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(500).optional(),
    price: z.number().nonnegative().optional(),
    graceDays: z.number().int().min(0).max(30).optional(),
    maxBranches: z.number().int().min(1).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();
export type UpdateSubscriptionPlanInput = z.infer<
  typeof updateSubscriptionPlanSchema
>;

export const updateSubscriptionStatusSchema = z
  .object({
    status: z.enum(["ACTIVE", "PAST_DUE", "EXPIRED", "CANCELLED"]),
    cancelReason: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine(
    (data) => data.status !== "CANCELLED" || data.cancelReason,
    "cancelReason is required when cancelling subscription",
  );
export type UpdateSubscriptionStatusInput = z.infer<
  typeof updateSubscriptionStatusSchema
>;

export const listSubscriptionsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  status: z.enum(["ACTIVE", "PAST_DUE", "EXPIRED", "CANCELLED"]).optional(),
  hostId: z.string().min(1).optional(),
});
export type ListSubscriptionsQuery = z.infer<
  typeof listSubscriptionsQuerySchema
>;

export const listSubscriptionInvoicesQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  status: z
    .enum(["PENDING", "PAID", "FAILED", "EXPIRED", "REFUNDED"])
    .optional(),
});
export type ListSubscriptionInvoicesQuery = z.infer<
  typeof listSubscriptionInvoicesQuerySchema
>;
