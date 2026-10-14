// @/app/api/v1/users/[id]/status/route.ts
import type { NextRequest } from "next/server";
import { requireAuth, requireRole } from "@/lib/authorization";
import {
  parseJsonBody,
  successResponse,
  withErrorHandling,
  zodErrorToAppError,
} from "@/lib/errors";
import { setUserStatus } from "@/services/userService";
import { setUserStatusSchema } from "@/validations/userSchema";

export const PATCH = withErrorHandling<{ id: string }>(
  async (request: NextRequest, { params }) => {
    const user = await requireAuth(request);
    requireRole(user, ["HOST"]);
    const { id } = await params;

    const parsed = setUserStatusSchema.safeParse(await parseJsonBody(request));
    if (!parsed.success) {
      throw zodErrorToAppError(parsed.error);
    }

    const updated = await setUserStatus(id, parsed.data);
    return successResponse({ user: updated });
  },
);
