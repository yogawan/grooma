// @/app/api/v1/transaction-change-requests/[id]/reject/route.ts
import type { NextRequest } from "next/server";
import { requireAuth, requireRole } from "@/lib/authorization";
import {
  parseJsonBody,
  successResponse,
  withErrorHandling,
  zodErrorToAppError,
} from "@/lib/errors";
import { rejectChangeRequest } from "@/services/approval.service";
import { rejectChangeRequestSchema } from "@/validations/approval.schema";

export const POST = withErrorHandling<{ id: string }>(
  async (request: NextRequest, { params }) => {
    const user = await requireAuth(request);
    requireRole(user, ["HOST"]);
    const { id } = await params;

    const parsed = rejectChangeRequestSchema.safeParse(
      await parseJsonBody(request),
    );
    if (!parsed.success) {
      throw zodErrorToAppError(parsed.error);
    }

    const transaction = await rejectChangeRequest(user, id, parsed.data);
    return successResponse({ transaction });
  },
);
