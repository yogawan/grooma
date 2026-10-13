// @/app/api/v1/transaction-change-requests/[id]/approve/route.ts
import type { NextRequest } from "next/server";
import { requireAuth, requireRole } from "@/lib/authorization";
import {
  parseJsonBody,
  successResponse,
  withErrorHandling,
  zodErrorToAppError,
} from "@/lib/errors";
import { approveChangeRequest } from "@/services/approval.service";
import { approveChangeRequestSchema } from "@/validations/approval.schema";

export const POST = withErrorHandling<{ id: string }>(
  async (request: NextRequest, { params }) => {
    const user = await requireAuth(request);
    requireRole(user, ["HOST"]);
    const { id } = await params;

    const parsed = approveChangeRequestSchema.safeParse(
      await parseJsonBody(request),
    );
    if (!parsed.success) {
      throw zodErrorToAppError(parsed.error);
    }

    const transaction = await approveChangeRequest(user, id, parsed.data);
    return successResponse({ transaction });
  },
);
