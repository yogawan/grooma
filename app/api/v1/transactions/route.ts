// @/app/api/v1/transactions/route.ts
import type { NextRequest } from "next/server";
import { requireAuth, requireRole } from "@/lib/authorization";
import {
  parseJsonBody,
  successResponse,
  withErrorHandling,
  zodErrorToAppError,
} from "@/lib/errors";
import {
  createTransaction,
  listTransactions,
} from "@/services/transactionService";
import {
  createTransactionSchema,
  listTransactionsQuerySchema,
} from "@/validations/transactionSchema";

export const GET = withErrorHandling(async (request: NextRequest) => {
  const user = await requireAuth(request);
  requireRole(user, ["HOST", "AGENT"]);

  const queryObject = Object.fromEntries(
    request.nextUrl.searchParams.entries(),
  );
  const parsedQuery = listTransactionsQuerySchema.safeParse(queryObject);
  if (!parsedQuery.success) {
    throw zodErrorToAppError(parsedQuery.error);
  }

  const result = await listTransactions(user, parsedQuery.data);
  return successResponse({
    transactions: result.items,
    pagination: result.pagination,
  });
});

export const POST = withErrorHandling(async (request: NextRequest) => {
  const user = await requireAuth(request);
  // DoD §21 #5: HOST cannot create transactions — AGENT only.
  requireRole(user, ["AGENT"]);

  const parsed = createTransactionSchema.safeParse(
    await parseJsonBody(request),
  );
  if (!parsed.success) {
    throw zodErrorToAppError(parsed.error);
  }

  const { transaction, payment, paymentError } = await createTransaction(
    user,
    parsed.data,
  );

  return successResponse({ transaction, payment, paymentError }, 201);
});
