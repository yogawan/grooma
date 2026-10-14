// @/app/api/v1/payments/midtrans/notification/route.ts
import type { NextRequest } from "next/server";
import {
  parseJsonBody,
  successResponse,
  withErrorHandling,
} from "@/lib/errors";
import { routeMidtransNotification } from "@/services/payment.service";

// Public gateway webhook (§7.8, §9.5) — intentionally no requireAuth/requireRole.
// Trust comes entirely from signature verification + re-fetching the
// authoritative status from Midtrans inside the notification handlers
// (§9.3), not from session auth.
// Routes to either Payment (POS) or SubscriptionInvoice (billing) based on
// providerOrderId prefix (§9.5).
export const POST = withErrorHandling(async (request: NextRequest) => {
  const body = await parseJsonBody(request);
  const result = await routeMidtransNotification(body);
  return successResponse(result);
});
