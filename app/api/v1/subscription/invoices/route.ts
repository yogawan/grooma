// @/app/api/v1/subscription/invoices/route.ts
import type { NextRequest } from "next/server";
import { requireAuth, requireRole } from "@/lib/authorization";
import {
  successResponse,
  withErrorHandling,
  zodErrorToAppError,
} from "@/lib/errors";
import { listInvoicesBySubscription } from "@/services/billingService";
import { getSubscriptionByHostId } from "@/services/subscriptionService";
import { listSubscriptionInvoicesQuerySchema } from "@/validations/subscriptionSchema";

export const GET = withErrorHandling(async (request: NextRequest) => {
  const user = await requireAuth(request, { subscriptionExempt: true });
  // §3.2: subscription and invoices are the HOST's own billing data;
  // AGENT and GROOMA_ADMIN have no entry here.
  requireRole(user, ["HOST"]);

  // Get HOST's subscription first
  const subscription = await getSubscriptionByHostId(user.id);
  if (!subscription) {
    return successResponse({
      invoices: [],
      pagination: { page: 1, limit: 20, total: 0, pages: 0 },
    });
  }

  // Parse query params
  const queryObject = Object.fromEntries(
    request.nextUrl.searchParams.entries(),
  );
  const parsed = listSubscriptionInvoicesQuerySchema.safeParse(queryObject);
  if (!parsed.success) {
    throw zodErrorToAppError(parsed.error);
  }

  const result = await listInvoicesBySubscription(
    String(subscription._id),
    parsed.data.page,
    parsed.data.limit,
  );

  return successResponse(result);
});
