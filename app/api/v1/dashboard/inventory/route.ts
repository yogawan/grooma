// @/app/api/v1/dashboard/inventory/route.ts
import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/authorization";
import {
  successResponse,
  withErrorHandling,
  zodErrorToAppError,
} from "@/lib/errors";
import { getInventorySummary } from "@/services/dashboardService";
import { inventoryQuerySchema } from "@/validations/dashboardSchema";

export const GET = withErrorHandling(async (request: NextRequest) => {
  const user = await requireAuth(request);

  const queryObject = Object.fromEntries(
    request.nextUrl.searchParams.entries(),
  );
  const parsed = inventoryQuerySchema.safeParse(queryObject);
  if (!parsed.success) {
    throw zodErrorToAppError(parsed.error);
  }

  const inventory = await getInventorySummary(user, parsed.data);
  return successResponse({ inventory });
});
