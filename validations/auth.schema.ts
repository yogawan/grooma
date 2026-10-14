// @/validations/auth.schema.ts
import { z } from "zod";

// Upper bounds exist mainly so an oversized string can't be thrown at
// argon2's hash/verify (cheap for us to reject, expensive for it to hash).
export const loginSchema = z
  .object({
    username: z.string().trim().min(1).max(64),
    password: z.string().trim().min(1).max(128),
  })
  .strict();

export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().trim().min(1).max(128),
    newPassword: z.string().trim().min(8).max(128),
  })
  .strict();

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
