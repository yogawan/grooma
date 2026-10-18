// @/validations/transactionSchema.ts
import { z } from "zod";
import { paginationQueryFields } from "@/lib/pagination";

// §8.3: the backend never trusts agentId, branchId, total, ownerRevenue,
// employeeRevenue, or serviceSnapshot from the client — they simply have no
// field here, and .strict() turns any attempt to send them into a 400
// instead of a silently-ignored no-op.
export const createTransactionSchema = z
  .object({
    customerId: z.string().trim().min(1).optional(),
    serviceId: z.string().trim().min(1),
    paymentMethod: z.enum(["CASH", "QRIS"]),
    discountAmount: z.number().nonnegative().optional().default(0),
    serviceHourType: z
      .enum(["REGULAR", "OVERTIME"])
      .optional()
      .default("REGULAR"),
  })
  .strict();
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;

export const listTransactionsQuerySchema = z.object({
  ...paginationQueryFields,
  search: z.string().trim().min(1).optional(),
  paymentStatus: z
    .enum(["PENDING", "PAID", "FAILED", "REFUNDED", "PARTIALLY_REFUNDED"])
    .optional(),
  transactionStatus: z
    .enum(["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"])
    .optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  branchId: z.string().min(1).optional(),
  agentId: z.string().min(1).optional(),
});
export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>;
