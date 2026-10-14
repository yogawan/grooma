// @/app/api/v1/dashboard/agents/route.ts
import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/authorization";
import {
  successResponse,
  withErrorHandling,
  zodErrorToAppError,
} from "@/lib/errors";
import { getAgentPerformance } from "@/services/dashboardService";
import { agentPerformanceQuerySchema } from "@/validations/dashboardSchema";

export const GET = withErrorHandling(async (request: NextRequest) => {
  const user = await requireAuth(request);

  const queryObject = Object.fromEntries(
    request.nextUrl.searchParams.entries(),
  );
  const parsed = agentPerformanceQuerySchema.safeParse(queryObject);
  if (!parsed.success) {
    throw zodErrorToAppError(parsed.error);
  }

  const agents = await getAgentPerformance(user, parsed.data);
  return successResponse({ agents });
});
