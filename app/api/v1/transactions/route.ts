// @/app/api/v1/transactions/route.ts
import type { NextRequest } from "next/server";
import { requireAuth, requireRole } from "@/lib/authorization";
import {
  Errors,
  parseJsonBody,
  successResponse,
  withErrorHandling,
  zodErrorToAppError,
} from "@/lib/errors";
import {
  isIdempotencyKeyRequired,
  readIdempotencyKey,
} from "@/lib/idempotency";
import { logger } from "@/lib/logger";
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

  // `Idempotency-Key` guards against a double-tapped charge becoming two
  // sales. Optional by default so clients already in the field keep working;
  // a deployment sets REQUIRE_IDEMPOTENCY_KEY=true once its mobile build
  // sends the header. Unkeyed submits are logged meanwhile so adoption can
  // be confirmed before enforcement is turned on.
  const idempotencyKey = readIdempotencyKey(request.headers);

  if (!idempotencyKey) {
    if (isIdempotencyKeyRequired()) {
      throw Errors.validation(
        "An Idempotency-Key header is required to create a transaction.",
      );
    }

    logger.warn("Transaction created without an Idempotency-Key", {
      agentId: user.id,
      // Distinguishes "client never sends it" from "client sent something
      // unusable" (blank or over-length), which readIdempotencyKey ignores.
      headerPresent: request.headers.has("idempotency-key"),
    });
  }

  const { transaction, payment, paymentError } = await createTransaction(
    user,
    parsed.data,
    idempotencyKey,
  );

  return successResponse({ transaction, payment, paymentError }, 201);
});
