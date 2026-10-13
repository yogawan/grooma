// @/app/api/v1/transactions/[id]/cancel/route.ts
import type { NextRequest } from "next/server";
import { requireAuth, requireRole } from "@/lib/authorization";
import { successResponse, withErrorHandling } from "@/lib/errors";
import { cancelTransaction } from "@/services/transaction.service";

export const POST = withErrorHandling<{ id: string }>(
  async (request: NextRequest, { params }) => {
    const user = await requireAuth(request);
    requireRole(user, ["HOST", "AGENT"]);
    const { id } = await params;

    const transaction = await cancelTransaction(user, id);
    return successResponse({ transaction });
  },
);
