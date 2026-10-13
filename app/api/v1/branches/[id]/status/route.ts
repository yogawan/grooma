// @/app/api/v1/branches/[id]/status/route.ts
import type { NextRequest } from "next/server";
import { requireAuth, requireRole } from "@/lib/authorization";
import {
  parseJsonBody,
  successResponse,
  withErrorHandling,
  zodErrorToAppError,
} from "@/lib/errors";
import { setBranchStatus } from "@/services/branch.service";
import { setBranchStatusSchema } from "@/validations/branch.schema";

export const PATCH = withErrorHandling<{ id: string }>(
  async (request: NextRequest, { params }) => {
    const user = await requireAuth(request);
    requireRole(user, ["HOST"]);
    const { id } = await params;

    const parsed = setBranchStatusSchema.safeParse(
      await parseJsonBody(request),
    );
    if (!parsed.success) {
      throw zodErrorToAppError(parsed.error);
    }

    const branch = await setBranchStatus(id, parsed.data);
    return successResponse({ branch });
  },
);
