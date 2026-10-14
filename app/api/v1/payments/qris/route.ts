// @/app/api/v1/payments/qris/route.ts
import type { NextRequest } from "next/server";
import { requireAuth, requireRole } from "@/lib/authorization";
import {
  parseJsonBody,
  successResponse,
  withErrorHandling,
  zodErrorToAppError,
} from "@/lib/errors";
import { createQrisPayment } from "@/services/paymentService";
import { createQrisPaymentSchema } from "@/validations/paymentSchema";

export const POST = withErrorHandling(async (request: NextRequest) => {
  const user = await requireAuth(request);
  requireRole(user, ["AGENT"]);

  const parsed = createQrisPaymentSchema.safeParse(
    await parseJsonBody(request),
  );
  if (!parsed.success) {
    throw zodErrorToAppError(parsed.error);
  }

  const payment = await createQrisPayment(user, parsed.data.transactionId);
  return successResponse({ payment }, 201);
});
