// @/app/api/v1/transactions/[id]/change-requests/route.ts
import type { NextRequest } from "next/server";
import { requireAuth, requireRole } from "@/lib/authorization";
import {
  parseJsonBody,
  successResponse,
  withErrorHandling,
  zodErrorToAppError,
} from "@/lib/errors";
import { submitChangeRequest } from "@/services/approvalService";
import { submitChangeRequestSchema } from "@/validations/approvalSchema";

export const POST = withErrorHandling<{ id: string }>(
  async (request: NextRequest, { params }) => {
    const user = await requireAuth(request);
    requireRole(user, ["HOST", "AGENT"]);
    const { id } = await params;

    const parsed = submitChangeRequestSchema.safeParse(
      await parseJsonBody(request),
    );
    if (!parsed.success) {
      throw zodErrorToAppError(parsed.error);
    }

    const transaction = await submitChangeRequest(user, id, parsed.data);
    return successResponse({ transaction }, 201);
  },
);
