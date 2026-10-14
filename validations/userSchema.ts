// @/validations/userSchema.ts
import { z } from "zod";

// GROOMA_ADMIN is deliberately excluded from this enum: that role cannot be
// created or edited through the normal /users endpoints (§3.1, §23.1).
const assignableRole = z.enum(["HOST", "AGENT"]);

export const createUserSchema = z
  .object({
    username: z.string().trim().toLowerCase().min(3).max(64),
    password: z.string().min(8).max(128),
    name: z.string().trim().min(1).max(100),
    role: assignableRole,
    branch: z.string().nullable().optional(),
    phone: z.string().trim().max(32).optional(),
    address: z.string().trim().max(255).optional(),
    photoUrl: z.string().trim().max(2048).optional(),
  })
  .strict();
export type CreateUserInput = z.infer<typeof createUserSchema>;

// username is immutable after creation; password changes go through
// /auth/change-password (self-service, requires current password).
export const updateUserSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    role: assignableRole.optional(),
    branch: z.string().nullable().optional(),
    phone: z.string().trim().max(32).optional(),
    address: z.string().trim().max(255).optional(),
    photoUrl: z.string().trim().max(2048).optional(),
  })
  .strict();
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const setUserStatusSchema = z
  .object({ status: z.enum(["ACTIVE", "INACTIVE"]) })
  .strict();
export type SetUserStatusInput = z.infer<typeof setUserStatusSchema>;

// §9.6/§5.1: GROOMA_ADMIN-only. Deliberately its own schema rather than a
// field on createUserSchema/updateUserSchema/updateProfileSchema — those are
// HOST- and self-service-facing, and .strict() there now rejects this key
// outright, which is the intended guard.
export const setPaymentIntegrationModeSchema = z
  .object({
    paymentIntegrationMode: z.enum(["MANAGED", "SELF_RECORDED"]),
  })
  .strict();
export type SetPaymentIntegrationModeInput = z.infer<
  typeof setPaymentIntegrationModeSchema
>;

// §13: profile updates can never touch role/branch/username/status — those
// keys are simply absent from this schema, and .strict() rejects them
// outright instead of silently dropping them.
export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    phone: z.string().trim().max(32).optional(),
    address: z.string().trim().max(255).optional(),
    photoUrl: z.string().trim().max(2048).optional(),
  })
  .strict();
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
