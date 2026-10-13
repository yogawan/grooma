// @/validations/branch.schema.ts
import { z } from "zod";

// Transaction code generation (Phase 3) formats dates in the branch's own
// timezone, which throws at runtime if it isn't a real IANA zone — reject
// bad input here instead of failing confusingly later.
const validTimezones = new Set(Intl.supportedValuesOf("timeZone"));

const branchFields = {
  branchCode: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(100),
  address: z.string().trim().max(255).optional(),
  phone: z.string().trim().max(32).optional(),
  timezone: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .refine((tz) => validTimezones.has(tz), "Invalid IANA timezone.")
    .optional(),
};

export const createBranchSchema = z.object(branchFields).strict();
export type CreateBranchInput = z.infer<typeof createBranchSchema>;

// branchCode is an identifier assigned at creation time; not editable after.
export const updateBranchSchema = z
  .object(branchFields)
  .omit({ branchCode: true })
  .partial()
  .strict();
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;

export const setBranchStatusSchema = z
  .object({ status: z.enum(["ACTIVE", "INACTIVE"]) })
  .strict();
export type SetBranchStatusInput = z.infer<typeof setBranchStatusSchema>;
