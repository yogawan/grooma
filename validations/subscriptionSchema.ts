// @/validations/subscriptionSchema.ts
//
// Only the HOST-facing subscription surface. The plan-authoring and
// subscription-status-override schemas that used to live here belonged to
// GROOMA_ADMIN endpoints and moved with them to the separate admin backend.
import { z } from "zod";

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
