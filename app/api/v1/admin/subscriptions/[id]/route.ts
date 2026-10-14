// @/app/api/v1/admin/subscriptions/[id]/route.ts
import type { NextRequest } from "next/server";
import { requireAuth, requireAdmin } from "@/lib/authorization";
import {
  successResponse,
  withErrorHandling,
  zodErrorToAppError,
  parseJsonBody,
} from "@/lib/errors";
import {
  getSubscriptionById,
  updateSubscriptionStatus,
} from "@/services/subscription.service";
import { updateSubscriptionStatusSchema } from "@/validations/subscription.schema";

export const GET = withErrorHandling<{ id: string }>(
  async (request: NextRequest, { params }) => {
    const user = await requireAuth(request);
    requireAdmin(user);
    const { id } = await params;

    const subscription = await getSubscriptionById(id);

    return successResponse({ subscription });
  },
);

export const PATCH = withErrorHandling<{ id: string }>(
  async (request: NextRequest, { params }) => {
    const user = await requireAuth(request);
    requireAdmin(user);
    const { id } = await params;

    const body = await parseJsonBody(request);
    const parsed = updateSubscriptionStatusSchema.safeParse(body);
    if (!parsed.success) {
      throw zodErrorToAppError(parsed.error);
    }

    const subscription = await updateSubscriptionStatus(id, parsed.data);

    return successResponse({ subscription });
  },
);
