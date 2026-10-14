// @/app/api/v1/dashboard/inventory/route.ts
import type { NextRequest } from "next/server";
import { requireAuth, requireRole } from "@/lib/authorization";
import {
  successResponse,
  withErrorHandling,
  zodErrorToAppError,
} from "@/lib/errors";
import { getInventorySummary } from "@/services/dashboardService";
import { inventoryQuerySchema } from "@/validations/dashboardSchema";

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
  const parsed = inventoryQuerySchema.safeParse(queryObject);
  if (!parsed.success) {
    throw zodErrorToAppError(parsed.error);
  }

  const inventory = await getInventorySummary(user, parsed.data);
  return successResponse({ inventory });
});
