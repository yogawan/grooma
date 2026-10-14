// @/app/api/v1/subscription/route.ts
import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/authorization";
import { successResponse, withErrorHandling } from "@/lib/errors";
import { getSubscriptionByHostId } from "@/services/subscriptionService";

export const GET = withErrorHandling(async (request: NextRequest) => {
  const user = await requireAuth(request);

  // HOST can only see their own subscription
  const subscription = await getSubscriptionByHostId(user.id);

  return successResponse({
    subscription: subscription || null,
  });
});
