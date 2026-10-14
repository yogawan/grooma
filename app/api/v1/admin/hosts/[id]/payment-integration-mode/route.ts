// @/app/api/v1/admin/hosts/[id]/payment-integration-mode/route.ts
import type { NextRequest } from "next/server";
import { requireAdmin, requireAuth } from "@/lib/authorization";
import {
  parseJsonBody,
  successResponse,
  withErrorHandling,
  zodErrorToAppError,
} from "@/lib/errors";
import { setPaymentIntegrationMode } from "@/services/userService";
import { setPaymentIntegrationModeSchema } from "@/validations/userSchema";

// §9.6: switching a HOST to MANAGED means Grooma starts holding that host's
// customer funds, so this is deliberately GROOMA_ADMIN-only and has no
// HOST-facing self-service equivalent (§5.1).
export const PATCH = withErrorHandling<{ id: string }>(
  async (request: NextRequest, { params }) => {
    const user = await requireAuth(request);
    requireAdmin(user);
    const { id } = await params;

    const parsed = setPaymentIntegrationModeSchema.safeParse(
      await parseJsonBody(request),
    );
    if (!parsed.success) {
      throw zodErrorToAppError(parsed.error);
    }

    const host = await setPaymentIntegrationMode(id, parsed.data);
    return successResponse({ user: host });
  },
);
