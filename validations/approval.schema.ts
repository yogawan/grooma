// @/validations/approval.schema.ts
import { z } from "zod";

// Whitelist of fields a change request may touch — deliberately excludes
// paymentMethod (too tightly coupled to the gateway flow already in
// progress) and branch/agent/transactionStatus/paymentStatus (those have
// their own dedicated mechanisms: complete/cancel and the Midtrans
// webhook). customerId is nullable so a request can correct "no customer
// recorded" in either direction.
export const requestedChangesSchema = z
  .object({
    serviceId: z.string().min(1).optional(),
    customerId: z.string().min(1).nullable().optional(),
    discountAmount: z.number().nonnegative().optional(),
    serviceHourType: z.enum(["REGULAR", "OVERTIME"]).optional(),
  })
  .strict()
  .refine(
    (changes) => Object.keys(changes).length > 0,
    "At least one change must be requested.",
  );

export const submitChangeRequestSchema = z
  .object({
    reason: z.string().trim().min(1).max(1000),
    requestedChanges: requestedChangesSchema,
  })
  .strict();
export type SubmitChangeRequestInput = z.infer<
  typeof submitChangeRequestSchema
>;

export const approveChangeRequestSchema = z
  .object({
    reviewNote: z.string().trim().max(1000).optional(),
    approvalReference: z.string().trim().max(255).optional(),
  })
  .strict();
export type ApproveChangeRequestInput = z.infer<
  typeof approveChangeRequestSchema
>;

// §10.1 step 11: a rejection's reason must be recorded, so reviewNote is
// required here (unlike approval, where it's optional justification).
export const rejectChangeRequestSchema = z
  .object({
    reviewNote: z.string().trim().min(1).max(1000),
  })
  .strict();
export type RejectChangeRequestInput = z.infer<
  typeof rejectChangeRequestSchema
>;

export const listChangeRequestsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
});
export type ListChangeRequestsQuery = z.infer<
  typeof listChangeRequestsQuerySchema
>;
