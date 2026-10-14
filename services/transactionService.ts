// @/services/transactionService.ts
import type { SessionUser } from "@/lib/auth";
import { requireBranchAccess } from "@/lib/authorization";
import { AppError, Errors } from "@/lib/errors";
import {
  claimIdempotencyKey,
  completeIdempotencyKey,
  releaseIdempotencyKey,
} from "@/lib/idempotency";
import { logger } from "@/lib/logger";
import { connectDB } from "@/lib/mongodb";
import { getPaymentIntegrationMode } from "@/lib/paymentConfig";
import { computeServicePricing, escapeRegex, extractRefId } from "@/lib/utils";
import BranchModel from "@/models/Branch";
import CustomerModel from "@/models/Customer";
import PaymentModel from "@/models/Payment";
import ServiceModel from "@/models/Service";
import TransactionModel from "@/models/Transaction";
import { createQrisPaymentForTransaction } from "@/services/paymentService";
import type {
  CreateTransactionInput,
  ListTransactionsQuery,
} from "@/validations/transactionSchema";

function formatDateInTimezone(date: Date, timezone: string): string {
  try {
    // "en-CA" conveniently formats as YYYY-MM-DD.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .format(date)
      .replace(/-/g, "");
  } catch {
    // Defensive fallback for any pre-existing Branch doc with a timezone
    // string that predates validations/branchSchema.ts's IANA check.
    return date.toISOString().slice(0, 10).replace(/-/g, "");
  }
}

async function generateUniqueTransactionCode(
  timezone: string,
): Promise<string> {
  const datePart = formatDateInTimezone(new Date(), timezone);

  for (let attempt = 0; attempt < 5; attempt++) {
    const suffix = Math.floor(100000 + Math.random() * 900000);
    const code = `GRM-${datePart}-${suffix}`;
    const exists = await TransactionModel.exists({ transactionCode: code });
    if (!exists) {
      return code;
    }
  }

  throw Errors.businessRule(
    "Failed to generate a unique transaction code, please retry.",
  );
}

// Returns the result of an already-completed idempotent submit. The latest
// Payment is included so a retried QRIS sale gets its QR code back rather
// than a success response with no way to collect.
async function replayTransaction(transactionId: string) {
  const transaction = await TransactionModel.findById(transactionId);
  if (!transaction) {
    // The key says we created it, but it is gone — refuse rather than
    // silently create a second sale under a key that is already spent.
    throw Errors.conflict(
      "The transaction for this Idempotency-Key no longer exists.",
    );
  }

  const payment = await PaymentModel.findOne({
    transaction: transaction._id,
  }).sort({ createdAt: -1 });

  return { transaction, payment, paymentError: null, replayed: true as const };
}

// §8.2/§8.3: agent and branch come from the session, never the request
// body. Price, discount validity, and revenue split are all computed here
// from data fetched fresh from the database, never trusted from the client.
export async function createTransaction(
  user: SessionUser,
  input: CreateTransactionInput,
  idempotencyKey: string | null = null,
) {
  await connectDB();

  if (!user.branch) {
    throw Errors.businessRule("Agent has no assigned branch.");
  }

  const branch = await BranchModel.findById(user.branch);
  if (!branch || branch.status !== "ACTIVE") {
    throw Errors.businessRule("Branch is not active.");
  }

  const service = await ServiceModel.findById(input.serviceId);
  if (!service || !service.isActive) {
    throw Errors.businessRule("Service is not available.");
  }

  let customer = null;
  if (input.customerId) {
    customer = await CustomerModel.findById(input.customerId);
    if (!customer || !customer.isActive) {
      throw Errors.businessRule("Customer is not available.");
    }
  }

  const { subtotal, total, ownerRevenue, employeeRevenue } =
    computeServicePricing(service, input.discountAmount);

  const transactionCode = await generateUniqueTransactionCode(branch.timezone);

  const isCash = input.paymentMethod === "CASH";

  // §9.6: on a SELF_RECORDED deployment the host's QRIS is its own,
  // collected outside Grooma, so there is nothing to charge and nothing to
  // wait for — the transaction is recorded as already paid, exactly like
  // CASH. `paymentMethod` still says QRIS so reporting can tell the two
  // apart (§12).
  const recordAsPaid =
    isCash || getPaymentIntegrationMode() === "SELF_RECORDED";

  // §M-6: claimed only once every validation above has passed, so a
  // rejected request never burns the client's key. Two simultaneous submits
  // of the same key both reach here; the unique index lets exactly one
  // through and the loser replays or is told the original is still running.
  if (idempotencyKey) {
    const claim = await claimIdempotencyKey(idempotencyKey, user.id);

    if (!claim.acquired) {
      if (claim.completedRefId) {
        return replayTransaction(claim.completedRefId);
      }

      throw Errors.conflict(
        "A transaction for this Idempotency-Key is still being processed.",
      );
    }
  }

  const transaction = await TransactionModel.create({
    transactionCode,
    branch: branch._id,
    agent: user.id,
    customer: customer?._id ?? null,
    service: service._id,
    serviceSnapshot: {
      name: service.name,
      price: service.price,
      ownerPercentage: service.revenueSharing.ownerPercentage,
      employeePercentage: service.revenueSharing.employeePercentage,
    },
    paymentMethod: input.paymentMethod,
    paymentStatus: recordAsPaid ? "PAID" : "PENDING",
    serviceHourType: input.serviceHourType,
    subtotal,
    discountAmount: input.discountAmount,
    total,
    ownerRevenue,
    employeeRevenue,
    paidAt: recordAsPaid ? new Date() : undefined,
  }).catch(async (error: unknown) => {
    // Hand the key back so the client can retry; otherwise a transient
    // write failure would block this key until its TTL expires.
    if (idempotencyKey) {
      await releaseIdempotencyKey(idempotencyKey, user.id);
    }
    throw error;
  });

  // Completed before the Midtrans attempt below: the sale already exists, so
  // a gateway hiccup must not make a retry create a second one.
  if (idempotencyKey) {
    await completeIdempotencyKey(idempotencyKey, user.id, transaction._id);
  }

  if (recordAsPaid) {
    return { transaction, payment: null, paymentError: null };
  }

  // The transaction record is the sale of record — a Midtrans hiccup here
  // must not make it disappear. Surface the failure without rolling back,
  // so the agent can retry via POST /payments/qris for the same
  // transaction instead of re-entering everything (§16: gateway failure
  // must not fabricate a payment status, not "must fail the whole sale").
  try {
    const payment = await createQrisPaymentForTransaction(transaction);
    return { transaction, payment, paymentError: null };
  } catch (error) {
    const message =
      error instanceof AppError ? error.message : "Unknown error.";
    logger.error("QRIS payment creation failed during transaction creation", {
      transactionId: transaction._id.toString(),
      message,
    });
    return { transaction, payment: null, paymentError: message };
  }
}

export async function listTransactions(
  user: SessionUser,
  query: ListTransactionsQuery,
) {
  await connectDB();

  const filter: Record<string, unknown> = {};

  if (user.role === "HOST") {
    if (query.branchId) filter.branch = query.branchId;
    if (query.agentId) filter.agent = query.agentId;
  } else {
    filter.branch = user.branch;
  }

  if (query.search) {
    filter.transactionCode = {
      $regex: escapeRegex(query.search),
      $options: "i",
    };
  }
  if (query.paymentStatus) filter.paymentStatus = query.paymentStatus;
  if (query.transactionStatus)
    filter.transactionStatus = query.transactionStatus;
  if (query.from || query.to) {
    const createdAt: Record<string, Date> = {};
    if (query.from) createdAt.$gte = query.from;
    if (query.to) createdAt.$lte = query.to;
    filter.createdAt = createdAt;
  }

  const skip = (query.page - 1) * query.limit;

  const [items, total] = await Promise.all([
    TransactionModel.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(query.limit)
      .populate("branch", "name")
      .populate("agent", "name")
      .populate("customer", "name phone")
      .lean(),
    TransactionModel.countDocuments(filter),
  ]);

  return {
    items,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

export async function getTransactionById(user: SessionUser, id: string) {
  await connectDB();

  const transaction = await TransactionModel.findById(id)
    .populate("branch", "name")
    .populate("agent", "name")
    .populate("customer", "name phone")
    .lean();

  if (!transaction) {
    throw Errors.notFound("Transaction not found.");
  }

  requireBranchAccess(user, extractRefId(transaction.branch));
  return transaction;
}

export async function completeTransaction(user: SessionUser, id: string) {
  await connectDB();

  const transaction = await TransactionModel.findById(id);
  if (!transaction) {
    throw Errors.notFound("Transaction not found.");
  }

  requireBranchAccess(user, extractRefId(transaction.branch));

  if (transaction.transactionStatus === "CANCELLED") {
    throw Errors.conflict("Cannot complete a cancelled transaction.");
  }
  if (transaction.transactionStatus === "COMPLETED") {
    throw Errors.conflict("Transaction is already completed.");
  }

  transaction.transactionStatus = "COMPLETED";
  transaction.completedAt = new Date();
  await transaction.save();

  return transaction;
}

export async function cancelTransaction(user: SessionUser, id: string) {
  await connectDB();

  const transaction = await TransactionModel.findById(id);
  if (!transaction) {
    throw Errors.notFound("Transaction not found.");
  }

  requireBranchAccess(user, extractRefId(transaction.branch));

  if (transaction.transactionStatus === "CANCELLED") {
    throw Errors.conflict("Transaction is already cancelled.");
  }
  if (transaction.transactionStatus === "COMPLETED") {
    throw Errors.conflict("Cannot cancel a completed transaction.");
  }

  transaction.transactionStatus = "CANCELLED";
  await transaction.save();

  return transaction;
}

export async function getReceipt(user: SessionUser, id: string) {
  await connectDB();

  const transaction = await TransactionModel.findById(id)
    .populate("branch", "name branchCode address phone")
    .populate("agent", "name")
    .populate("customer", "name phone");

  if (!transaction) {
    throw Errors.notFound("Transaction not found.");
  }

  requireBranchAccess(user, extractRefId(transaction.branch));

  transaction.receipt.printed = true;
  transaction.receipt.printedAt = new Date();
  transaction.receipt.printCount = (transaction.receipt.printCount ?? 0) + 1;
  await transaction.save();

  return transaction;
}
