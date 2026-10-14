// @/app/api/v1/admin/subscription-plans/[id]/route.ts
import type { NextRequest } from "next/server";
import { requireAdmin, requireAuth } from "@/lib/authorization";
import {
  parseJsonBody,
  successResponse,
  withErrorHandling,
  zodErrorToAppError,
} from "@/lib/errors";
import {
  getSubscriptionPlan,
  updateSubscriptionPlan,
} from "@/services/subscriptionService";
import { updateSubscriptionPlanSchema } from "@/validations/subscriptionSchema";

export const GET = withErrorHandling<{ id: string }>(
  async (request: NextRequest, { params }) => {
    const user = await requireAuth(request);
    requireAdmin(user);
    const { id } = await params;

    const plan = await getSubscriptionPlan(id);

    return successResponse({ plan });
  },
);

export const PATCH = withErrorHandling<{ id: string }>(
  async (request: NextRequest, { params }) => {
    const user = await requireAuth(request);
    requireAdmin(user);
    const { id } = await params;

    const body = await parseJsonBody(request);
    const parsed = updateSubscriptionPlanSchema.safeParse(body);
    if (!parsed.success) {
      throw zodErrorToAppError(parsed.error);
    }

    const plan = await updateSubscriptionPlan(id, parsed.data);

    return successResponse({ plan });
  },
);
