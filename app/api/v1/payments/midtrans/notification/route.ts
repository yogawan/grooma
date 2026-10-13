// @/app/api/v1/payments/midtrans/notification/route.ts
import type { NextRequest } from "next/server";
import {
  parseJsonBody,
  successResponse,
  withErrorHandling,
} from "@/lib/errors";
import { processMidtransNotification } from "@/services/payment.service";

// Public gateway webhook (§7.8) — intentionally no requireAuth/requireRole.
// Trust comes entirely from signature verification + re-fetching the
// authoritative status from Midtrans inside processMidtransNotification
// (§9.3), not from session auth.
export const POST = withErrorHandling(async (request: NextRequest) => {
  const body = await parseJsonBody(request);
  const result = await processMidtransNotification(body);
  return successResponse(result);
});
