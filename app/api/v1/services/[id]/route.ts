// @/app/api/v1/services/[id]/route.ts
import type { NextRequest } from "next/server";
import { requireAuth, requireRole } from "@/lib/authorization";
import {
  parseJsonBody,
  successResponse,
  withErrorHandling,
  zodErrorToAppError,
} from "@/lib/errors";
import { getServiceById, updateService } from "@/services/serviceService";
import { updateServiceSchema } from "@/validations/serviceSchema";

export const GET = withErrorHandling<{ id: string }>(
  async (request: NextRequest, { params }) => {
    const user = await requireAuth(request);
    requireRole(user, ["HOST", "AGENT"]);
    const { id } = await params;

    const service = await getServiceById(id);
    return successResponse({ service });
  },
);

export const PATCH = withErrorHandling<{ id: string }>(
  async (request: NextRequest, { params }) => {
    const user = await requireAuth(request);
    requireRole(user, ["HOST"]);
    const { id } = await params;

    const parsed = updateServiceSchema.safeParse(await parseJsonBody(request));
    if (!parsed.success) {
      throw zodErrorToAppError(parsed.error);
    }

    const service = await updateService(id, parsed.data);
    return successResponse({ service });
  },
);
