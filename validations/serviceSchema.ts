// @/validations/serviceSchema.ts
import { z } from "zod";
import { paginationQueryFields } from "@/lib/pagination";

const revenueSharingSchema = z.object({
  ownerPercentage: z.number().min(0).max(100),
  employeePercentage: z.number().min(0).max(100),
});

const serviceFields = {
  serviceCode: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(1000).optional(),
  category: z.string().trim().max(50).optional(),
  price: z.number().nonnegative(),
  durationMinutes: z.number().int().positive().optional(),
  // Both percentages must be sent together — the model's own pre-validate
  // hook enforces they sum to 100 on every save, so a partial patch that
  // could leave a temporarily-invalid split is rejected by construction.
  revenueSharing: revenueSharingSchema,
};

export const createServiceSchema = z.object(serviceFields).strict();
export type CreateServiceInput = z.infer<typeof createServiceSchema>;

// serviceCode is an identifier assigned at creation time; not editable after.
export const updateServiceSchema = z
  .object(serviceFields)
  .omit({ serviceCode: true })
  .partial()
  .strict();
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;

export const setServiceStatusSchema = z
  .object({ isActive: z.boolean() })
  .strict();
export type SetServiceStatusInput = z.infer<typeof setServiceStatusSchema>;

export const listServicesQuerySchema = z.object({
  ...paginationQueryFields,
});
export type ListServicesQuery = z.infer<typeof listServicesQuerySchema>;
