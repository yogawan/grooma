// @/app/api/v1/customers/[id]/status/route.ts
import type { NextRequest } from "next/server";
import { requireAuth, requireRole } from "@/lib/authorization";
import {
  parseJsonBody,
  successResponse,
  withErrorHandling,
  zodErrorToAppError,
} from "@/lib/errors";
import { setCustomerStatus } from "@/services/customerService";
import { setCustomerStatusSchema } from "@/validations/customerSchema";

export const PATCH = withErrorHandling<{ id: string }>(
  async (request: NextRequest, { params }) => {
    const user = await requireAuth(request);
    requireRole(user, ["HOST"]);
    const { id } = await params;

    const parsed = setCustomerStatusSchema.safeParse(
      await parseJsonBody(request),
    );
    if (!parsed.success) {
      throw zodErrorToAppError(parsed.error);
    }

    const customer = await setCustomerStatus(id, parsed.data, user.role);
    return successResponse({ customer });
  },
);
