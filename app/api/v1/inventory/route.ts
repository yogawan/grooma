// @/app/api/v1/inventory/route.ts
import type { NextRequest } from "next/server";
import { requireAuth, requireRole } from "@/lib/authorization";
import {
  parseJsonBody,
  successResponse,
  withErrorHandling,
  zodErrorToAppError,
} from "@/lib/errors";
import { createItem, listItems } from "@/services/inventoryService";
import {
  createInventorySchema,
  listInventoryQuerySchema,
} from "@/validations/inventorySchema";

export const GET = withErrorHandling(async (request: NextRequest) => {
  const user = await requireAuth(request);
  requireRole(user, ["HOST", "AGENT"]);

  const queryObject = Object.fromEntries(
    request.nextUrl.searchParams.entries(),
  );
  const parsedQuery = listInventoryQuerySchema.safeParse(queryObject);
  if (!parsedQuery.success) {
    throw zodErrorToAppError(parsedQuery.error);
  }

  const result = await listItems(user, parsedQuery.data);
  return successResponse({
    items: result.items,
    pagination: result.pagination,
  });
});

export const POST = withErrorHandling(async (request: NextRequest) => {
  const user = await requireAuth(request);
  requireRole(user, ["HOST", "AGENT"]);

  const parsed = createInventorySchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    throw zodErrorToAppError(parsed.error);
  }

  const item = await createItem(user, parsed.data);
  return successResponse({ item }, 201);
});
