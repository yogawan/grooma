// @/app/api/v1/dashboard/services/route.ts
import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/authorization";
import {
  successResponse,
  withErrorHandling,
  zodErrorToAppError,
} from "@/lib/errors";
import { getServicePerformance } from "@/services/dashboard.service";
import { servicePerformanceQuerySchema } from "@/validations/dashboard.schema";

export const GET = withErrorHandling(async (request: NextRequest) => {
  const user = await requireAuth(request);

  const queryObject = Object.fromEntries(
    request.nextUrl.searchParams.entries(),
  );
  const parsed = servicePerformanceQuerySchema.safeParse(queryObject);
  if (!parsed.success) {
    throw zodErrorToAppError(parsed.error);
  }

  const services = await getServicePerformance(user, parsed.data);
  return successResponse({ services });
});
