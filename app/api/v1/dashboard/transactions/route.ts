// @/app/api/v1/dashboard/transactions/route.ts
import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/authorization";
import {
  successResponse,
  withErrorHandling,
  zodErrorToAppError,
} from "@/lib/errors";
import { getTransactionStats } from "@/services/dashboard.service";
import { transactionStatsQuerySchema } from "@/validations/dashboard.schema";

export const GET = withErrorHandling(async (request: NextRequest) => {
  const user = await requireAuth(request);

  const queryObject = Object.fromEntries(
    request.nextUrl.searchParams.entries(),
  );
  const parsed = transactionStatsQuerySchema.safeParse(queryObject);
  if (!parsed.success) {
    throw zodErrorToAppError(parsed.error);
  }

  const stats = await getTransactionStats(user, parsed.data);
  return successResponse({ stats });
});
