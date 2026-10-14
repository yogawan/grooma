// @/validations/paymentSchema.ts
import { z } from "zod";

// Not named in PLAN-GROOMA.md's Phase 3 "Validations" bullet (only
// transaction.schema.ts is listed there), but POST /payments/qris (§7.8)
// needs its body validated regardless — the checklist names the obvious
// one, not an exhaustive contract.
export const createQrisPaymentSchema = z
  .object({
    transactionId: z
      .string()
      .trim()
      .min(24)
      .max(24)
      .regex(/^[0-9a-f]{24}$/i, "Invalid ObjectId format"),
  })
  .strict();
export type CreateQrisPaymentInput = z.infer<typeof createQrisPaymentSchema>;
