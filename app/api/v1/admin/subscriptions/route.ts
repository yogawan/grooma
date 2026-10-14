// @/app/api/v1/admin/subscriptions/route.ts
import type { NextRequest } from "next/server";
import { requireAdmin, requireAuth } from "@/lib/authorization";
import {
  successResponse,
  withErrorHandling,
  zodErrorToAppError,
} from "@/lib/errors";
import { listSubscriptions } from "@/services/subscriptionService";
import { listSubscriptionsQuerySchema } from "@/validations/subscriptionSchema";

export const GET = withErrorHandling(async (request: NextRequest) => {
  const user = await requireAuth(request);
  requireAdmin(user);

  const queryObject = Object.fromEntries(
    request.nextUrl.searchParams.entries(),
  );
  const parsed = listSubscriptionsQuerySchema.safeParse(queryObject);
  if (!parsed.success) {
    throw zodErrorToAppError(parsed.error);
  }

  const result = await listSubscriptions(parsed.data);

  return successResponse(result);
});
