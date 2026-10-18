// @/app/api/v1/subscription/invoices/route.ts
import type { NextRequest } from "next/server";
import { requireAuth, requireRole } from "@/lib/authorization";
import {
  successResponse,
  withErrorHandling,
  zodErrorToAppError,
} from "@/lib/errors";
import {
  emptyInvoicePage,
  listInvoicesBySubscription,
} from "@/services/billingService";
import { getSubscriptionByHostId } from "@/services/subscriptionService";
import { listSubscriptionInvoicesQuerySchema } from "@/validations/subscriptionSchema";

export const GET = withErrorHandling(async (request: NextRequest) => {
  const user = await requireAuth(request, { subscriptionPolicy: "EXEMPT_ALL" });
  // §3.2: subscription and invoices are the HOST's own billing data;
  // AGENT has no entry here; no other role can hold a session (§3.6).
  requireRole(user, ["HOST"]);

  // Parsed before the no-subscription early return below, not after: a bad
  // ?limit=abc used to get a 200 on that path and a 400 on the normal one,
  // and the empty envelope could not echo a page/limit it had never read.
  const queryObject = Object.fromEntries(
    request.nextUrl.searchParams.entries(),
  );
  const parsed = listSubscriptionInvoicesQuerySchema.safeParse(queryObject);
  if (!parsed.success) {
    throw zodErrorToAppError(parsed.error);
  }

  const subscription = await getSubscriptionByHostId(user.id);
  if (!subscription) {
    return successResponse(emptyInvoicePage(parsed.data));
  }

  const result = await listInvoicesBySubscription(
    String(subscription._id),
    parsed.data,
  );

  return successResponse(result);
});
