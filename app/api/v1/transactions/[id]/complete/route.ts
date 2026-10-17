// @/app/api/v1/transactions/[id]/complete/route.ts
import type { NextRequest } from "next/server";
import { requireAuth, requireRole } from "@/lib/authorization";
import { successResponse, withErrorHandling } from "@/lib/errors";
import { completeTransaction } from "@/services/transactionService";

export const POST = withErrorHandling<{ id: string }>(
  async (request: NextRequest, { params }) => {
    const user = await requireAuth(request, {
      subscriptionPolicy: "EXEMPT_AGENT",
    });
    requireRole(user, ["AGENT"]);
    const { id } = await params;

    const transaction = await completeTransaction(user, id);
    return successResponse({ transaction });
  },
);
