// @/app/api/v1/transaction-change-requests/[id]/route.ts
import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/authorization";
import { successResponse, withErrorHandling } from "@/lib/errors";
import { getChangeRequestById } from "@/services/approval.service";

// No requireRole gate: access is data-dependent (HOST or the requester
// themselves), enforced inside getChangeRequestById (§7.9).
export const GET = withErrorHandling<{ id: string }>(
  async (request: NextRequest, { params }) => {
    const user = await requireAuth(request);
    const { id } = await params;

    const transaction = await getChangeRequestById(user, id);
    return successResponse({ transaction });
  },
);
