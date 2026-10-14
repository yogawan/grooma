// @/app/api/v1/profile/route.ts
import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/authorization";
import {
  parseJsonBody,
  successResponse,
  withErrorHandling,
  zodErrorToAppError,
} from "@/lib/errors";
import { getOwnProfile, updateOwnProfile } from "@/services/userService";
import { updateProfileSchema } from "@/validations/userSchema";

// No requireRole gate: both roles this service serves manage their own
// profile (§3.2 matrix — "own profile only" applies equally to HOST and
// AGENT), and no session can hold any other role (§3.6).
export const GET = withErrorHandling(async (request: NextRequest) => {
  const user = await requireAuth(request, { subscriptionExempt: true });
  const profile = await getOwnProfile(user);
  return successResponse({ user: profile });
});

export const PATCH = withErrorHandling(async (request: NextRequest) => {
  const user = await requireAuth(request, { subscriptionExempt: true });

  const parsed = updateProfileSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    throw zodErrorToAppError(parsed.error);
  }

  const profile = await updateOwnProfile(user, parsed.data);
  return successResponse({ user: profile });
});
