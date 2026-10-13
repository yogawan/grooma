// @/app/api/v1/inventory/[id]/route.ts
import type { NextRequest } from "next/server";
import { requireAuth, requireRole } from "@/lib/authorization";
import {
  parseJsonBody,
  successResponse,
  withErrorHandling,
  zodErrorToAppError,
} from "@/lib/errors";
import {
  getItemById,
  softDeleteItem,
  updateItem,
} from "@/services/inventory.service";
import { updateInventorySchema } from "@/validations/inventory.schema";

export const GET = withErrorHandling<{ id: string }>(
  async (request: NextRequest, { params }) => {
    const user = await requireAuth(request);
    requireRole(user, ["HOST", "AGENT"]);
    const { id } = await params;

    const item = await getItemById(user, id);
    return successResponse({ item });
  },
);

export const PATCH = withErrorHandling<{ id: string }>(
  async (request: NextRequest, { params }) => {
    const user = await requireAuth(request);
    requireRole(user, ["HOST", "AGENT"]);
    const { id } = await params;

    const parsed = updateInventorySchema.safeParse(
      await parseJsonBody(request),
    );
    if (!parsed.success) {
      throw zodErrorToAppError(parsed.error);
    }

    const item = await updateItem(user, id, parsed.data);
    return successResponse({ item });
  },
);

// Real HTTP DELETE, but always a soft delete under the hood (§5.6, §11.3).
export const DELETE = withErrorHandling<{ id: string }>(
  async (request: NextRequest, { params }) => {
    const user = await requireAuth(request);
    requireRole(user, ["HOST", "AGENT"]);
    const { id } = await params;

    const item = await softDeleteItem(user, id);
    return successResponse({ item });
  },
);
