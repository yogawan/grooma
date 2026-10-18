// @/app/api/v1/dashboard/services/route.ts
import type { NextRequest } from "next/server";
import { requireAuth, requireRole } from "@/lib/authorization";
import {
  successResponse,
  withErrorHandling,
  zodErrorToAppError,
} from "@/lib/errors";
import { getServicePerformance } from "@/services/dashboardService";
import { servicePerformanceQuerySchema } from "@/validations/dashboardSchema";

export const GET = withErrorHandling(async (request: NextRequest) => {
  const user = await requireAuth(request);
  // §3.1/§3.2: a platform role has no access to operational POS data. Kept
  // explicit even though no other role can hold a session here (§3.6) — this
  // gate is what regression H-2 restored.
  // Without this gate the branch filters in dashboardService resolve to
  // "no filter" for that role (branch is null, role is neither
  // HOST nor AGENT), returning business-wide figures.
  requireRole(user, ["HOST", "AGENT"]);

  const queryObject = Object.fromEntries(
    request.nextUrl.searchParams.entries(),
  );
  const parsed = servicePerformanceQuerySchema.safeParse(queryObject);
  if (!parsed.success) {
    throw zodErrorToAppError(parsed.error);
  }

  const result = await getServicePerformance(user, parsed.data);
  // `services` stays the array it always was; the cap metadata is a sibling
  // key so a client reading data.services is unaffected.
  return successResponse({
    services: result.items,
    meta: {
      limit: result.limit,
      total: result.total,
      truncated: result.truncated,
    },
  });
});
