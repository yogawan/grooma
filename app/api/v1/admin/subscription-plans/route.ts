// @/app/api/v1/admin/subscription-plans/route.ts
import type { NextRequest } from "next/server";
import { requireAdmin, requireAuth } from "@/lib/authorization";
import {
  parseJsonBody,
  successResponse,
  withErrorHandling,
  zodErrorToAppError,
} from "@/lib/errors";
import {
  createSubscriptionPlan,
  listSubscriptionPlans,
} from "@/services/subscriptionService";
import { createSubscriptionPlanSchema } from "@/validations/subscriptionSchema";

export const GET = withErrorHandling(async (request: NextRequest) => {
  const user = await requireAuth(request);
  requireAdmin(user);

  const plans = await listSubscriptionPlans();

  return successResponse({ plans });
});

export const POST = withErrorHandling(async (request: NextRequest) => {
  const user = await requireAuth(request);
  requireAdmin(user);

  const body = await parseJsonBody(request);
  const parsed = createSubscriptionPlanSchema.safeParse(body);
  if (!parsed.success) {
    throw zodErrorToAppError(parsed.error);
  }

  const plan = await createSubscriptionPlan(parsed.data);

  return successResponse({ plan }, 201);
});
