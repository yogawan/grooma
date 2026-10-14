// @/app/api/v1/subscription/invoices/route.ts
import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/authorization";
import {
  successResponse,
  withErrorHandling,
  zodErrorToAppError,
} from "@/lib/errors";
import { getSubscriptionByHostId } from "@/services/subscription.service";
import { listSubscriptionInvoicesQuerySchema } from "@/validations/subscription.schema";
import { listInvoicesBySubscription } from "@/services/billing.service";

export const GET = withErrorHandling(async (request: NextRequest) => {
  const user = await requireAuth(request);

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
