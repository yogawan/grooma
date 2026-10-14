// @/app/api/v1/subscription/route.ts
import type { NextRequest } from "next/server";
import { requireAuth, requireRole } from "@/lib/authorization";
import { successResponse, withErrorHandling } from "@/lib/errors";
import { getSubscriptionByHostId } from "@/services/subscriptionService";

export const GET = withErrorHandling(async (request: NextRequest) => {
  const user = await requireAuth(request, { subscriptionExempt: true });
  // §3.2: subscription and invoices are the HOST's own billing data;
  // AGENT and GROOMA_ADMIN have no entry here.
  requireRole(user, ["HOST"]);

  // HOST can only see their own subscription
  const subscription = await getSubscriptionByHostId(user.id);

  return successResponse({
    subscription: subscription || null,
  });
});
