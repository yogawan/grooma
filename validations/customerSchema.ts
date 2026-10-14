// @/validations/customerSchema.ts
import { z } from "zod";

// customerType and loyaltyPoints are deliberately absent from every schema
// below: customerType's DECOY classification is explicitly deferred (§1),
// and loyaltyPoints may only change through an auditable transaction
// mechanism, never a direct profile edit (§5.3). .strict() turns any
// attempt to sneak them in into a clean 400 instead of a silent no-op.
const customerFields = {
  name: z.string().trim().min(1).max(100),
  phone: z.string().trim().max(32).optional(),
  email: z.string().trim().toLowerCase().email().max(254).optional(),
  gender: z.enum(["MALE", "FEMALE", "OTHER", "UNSPECIFIED"]).optional(),
  birthDate: z.coerce.date().optional(),
  address: z.string().trim().max(255).optional(),
  notes: z.string().trim().max(1000).optional(),
};

export const createCustomerSchema = z.object(customerFields).strict();
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = z.object(customerFields).partial().strict();
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

export const setCustomerStatusSchema = z
  .object({ isActive: z.boolean() })
  .strict();
export type SetCustomerStatusInput = z.infer<typeof setCustomerStatusSchema>;
