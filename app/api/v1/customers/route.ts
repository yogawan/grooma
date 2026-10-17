// @/app/api/v1/customers/route.ts
import type { NextRequest } from "next/server";
import { requireAuth, requireRole } from "@/lib/authorization";
import {
  parseJsonBody,
  successResponse,
  withErrorHandling,
  zodErrorToAppError,
} from "@/lib/errors";
import { createCustomer, listCustomers } from "@/services/customerService";
import { createCustomerSchema } from "@/validations/customerSchema";

export const GET = withErrorHandling(async (request: NextRequest) => {
  const user = await requireAuth(request, {
    subscriptionPolicy: "EXEMPT_AGENT",
  });
  requireRole(user, ["HOST", "AGENT"]);

  const search = request.nextUrl.searchParams.get("search") ?? undefined;
  const customers = await listCustomers(user.role, search);
  return successResponse({ customers });
});

export const POST = withErrorHandling(async (request: NextRequest) => {
  const user = await requireAuth(request, {
    subscriptionPolicy: "EXEMPT_AGENT",
  });
  requireRole(user, ["HOST", "AGENT"]);

  const parsed = createCustomerSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    throw zodErrorToAppError(parsed.error);
  }

  const customer = await createCustomer(parsed.data, user.role);
  return successResponse({ customer }, 201);
});
