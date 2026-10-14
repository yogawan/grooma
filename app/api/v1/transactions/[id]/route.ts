// @/app/api/v1/transactions/[id]/route.ts
import type { NextRequest } from "next/server";
import { requireAuth, requireRole } from "@/lib/authorization";
import { successResponse, withErrorHandling } from "@/lib/errors";
import { getTransactionById } from "@/services/transactionService";

export const GET = withErrorHandling<{ id: string }>(
  async (request: NextRequest, { params }) => {
    const user = await requireAuth(request);
    requireRole(user, ["HOST", "AGENT"]);
    const { id } = await params;

    const transaction = await getTransactionById(user, id);
    return successResponse({ transaction });
  },
);
