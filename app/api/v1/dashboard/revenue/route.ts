// @/app/api/v1/dashboard/revenue/route.ts
import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/authorization";
import {
  successResponse,
  withErrorHandling,
  zodErrorToAppError,
} from "@/lib/errors";
import { getRevenue } from "@/services/dashboard.service";
import { revenueQuerySchema } from "@/validations/dashboard.schema";

export const GET = withErrorHandling(async (request: NextRequest) => {
  const user = await requireAuth(request);

  const queryObject = Object.fromEntries(
    request.nextUrl.searchParams.entries(),
  );
  const parsed = revenueQuerySchema.safeParse(queryObject);
  if (!parsed.success) {
    throw zodErrorToAppError(parsed.error);
  }

  const revenue = await getRevenue(user, parsed.data);
  return successResponse({ revenue });
});
