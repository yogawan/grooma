// @/app/api/v1/transaction-change-requests/route.ts
import type { NextRequest } from "next/server";
import { requireAuth, requireRole } from "@/lib/authorization";
import {
  successResponse,
  withErrorHandling,
  zodErrorToAppError,
} from "@/lib/errors";
import { listPendingChangeRequests } from "@/services/approvalService";
import { listChangeRequestsQuerySchema } from "@/validations/approvalSchema";

export const GET = withErrorHandling(async (request: NextRequest) => {
  const user = await requireAuth(request);
  requireRole(user, ["HOST"]);

  const queryObject = Object.fromEntries(
    request.nextUrl.searchParams.entries(),
  );
  const parsedQuery = listChangeRequestsQuerySchema.safeParse(queryObject);
  if (!parsedQuery.success) {
    throw zodErrorToAppError(parsedQuery.error);
  }

  const result = await listPendingChangeRequests(parsedQuery.data);
  return successResponse({
    transactions: result.items,
    pagination: result.pagination,
  });
});
