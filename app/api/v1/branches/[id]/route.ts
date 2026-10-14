// @/app/api/v1/branches/[id]/route.ts
import type { NextRequest } from "next/server";
import { requireAuth, requireRole } from "@/lib/authorization";
import {
  parseJsonBody,
  successResponse,
  withErrorHandling,
  zodErrorToAppError,
} from "@/lib/errors";
import { getBranchById, updateBranch } from "@/services/branchService";
import { updateBranchSchema } from "@/validations/branchSchema";

export const GET = withErrorHandling<{ id: string }>(
  async (request: NextRequest, { params }) => {
    const user = await requireAuth(request);
    const { id } = await params;

    const branch = await getBranchById(user, id);
    return successResponse({ branch });
  },
);

export const PATCH = withErrorHandling<{ id: string }>(
  async (request: NextRequest, { params }) => {
    const user = await requireAuth(request);
    requireRole(user, ["HOST"]);
    const { id } = await params;

    const parsed = updateBranchSchema.safeParse(await parseJsonBody(request));
    if (!parsed.success) {
      throw zodErrorToAppError(parsed.error);
    }

    const branch = await updateBranch(id, parsed.data);
    return successResponse({ branch });
  },
);
