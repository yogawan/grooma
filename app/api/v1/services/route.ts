// @/app/api/v1/services/route.ts
import type { NextRequest } from "next/server";
import { requireAuth, requireRole } from "@/lib/authorization";
import {
  parseJsonBody,
  successResponse,
  withErrorHandling,
  zodErrorToAppError,
} from "@/lib/errors";
import { createService, listServices } from "@/services/serviceService";
import { createServiceSchema } from "@/validations/serviceSchema";

export const GET = withErrorHandling(async (request: NextRequest) => {
  const user = await requireAuth(request);
  requireRole(user, ["HOST", "AGENT"]);

  const services = await listServices(user.role);
  return successResponse({ services });
});

export const POST = withErrorHandling(async (request: NextRequest) => {
  const user = await requireAuth(request);
  requireRole(user, ["HOST"]);

  const parsed = createServiceSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    throw zodErrorToAppError(parsed.error);
  }

  const service = await createService(parsed.data);
  return successResponse({ service }, 201);
});
