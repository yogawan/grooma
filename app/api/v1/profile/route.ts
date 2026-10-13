// @/app/api/v1/profile/route.ts
import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/authorization";
import {
  parseJsonBody,
  successResponse,
  withErrorHandling,
  zodErrorToAppError,
} from "@/lib/errors";
import { getOwnProfile, updateOwnProfile } from "@/services/user.service";
import { updateProfileSchema } from "@/validations/user.schema";

// No requireRole gate: HOST, AGENT, and GROOMA_ADMIN all manage their own
// profile (§3.2 matrix — "own profile only" applies equally to all three).
export const GET = withErrorHandling(async (request: NextRequest) => {
  const user = await requireAuth(request);
  const profile = await getOwnProfile(user);
  return successResponse({ user: profile });
});

export const PATCH = withErrorHandling(async (request: NextRequest) => {
  const user = await requireAuth(request);

  const parsed = updateProfileSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    throw zodErrorToAppError(parsed.error);
  }

  const profile = await updateOwnProfile(user, parsed.data);
  return successResponse({ user: profile });
});
