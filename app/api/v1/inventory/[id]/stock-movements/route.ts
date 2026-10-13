// @/app/api/v1/inventory/[id]/stock-movements/route.ts
import type { NextRequest } from "next/server";
import { requireAuth, requireRole } from "@/lib/authorization";
import {
  parseJsonBody,
  successResponse,
  withErrorHandling,
  zodErrorToAppError,
} from "@/lib/errors";
import { adjustStock, listStockMovements } from "@/services/inventory.service";
import {
  listStockMovementsQuerySchema,
  stockMovementSchema,
} from "@/validations/inventory.schema";

export const GET = withErrorHandling<{ id: string }>(
  async (request: NextRequest, { params }) => {
    const user = await requireAuth(request);
    requireRole(user, ["HOST", "AGENT"]);
    const { id } = await params;

    const queryObject = Object.fromEntries(
      request.nextUrl.searchParams.entries(),
    );
    const parsedQuery = listStockMovementsQuerySchema.safeParse(queryObject);
    if (!parsedQuery.success) {
      throw zodErrorToAppError(parsedQuery.error);
    }

    const result = await listStockMovements(user, id, parsedQuery.data);
    return successResponse({
      movements: result.items,
      pagination: result.pagination,
    });
  },
);

export const POST = withErrorHandling<{ id: string }>(
  async (request: NextRequest, { params }) => {
    const user = await requireAuth(request);
    requireRole(user, ["HOST", "AGENT"]);
    const { id } = await params;

    const parsed = stockMovementSchema.safeParse(await parseJsonBody(request));
    if (!parsed.success) {
      throw zodErrorToAppError(parsed.error);
    }

    const { item, movement } = await adjustStock(user, id, parsed.data);
    return successResponse({ item, movement }, 201);
  },
);
