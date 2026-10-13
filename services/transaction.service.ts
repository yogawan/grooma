// @/services/transaction.service.ts
import type { SessionUser } from "@/lib/auth";
import { requireBranchAccess } from "@/lib/authorization";
import { AppError, Errors } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { connectDB } from "@/lib/mongodb";
import { escapeRegex, extractRefId } from "@/lib/utils";
import BranchModel from "@/models/Branch";
import CustomerModel from "@/models/Customer";
import ServiceModel from "@/models/Service";
import TransactionModel from "@/models/Transaction";
import { createQrisPaymentForTransaction } from "@/services/payment.service";
import type {
  CreateTransactionInput,
  ListTransactionsQuery,
} from "@/validations/transaction.schema";

function roundCurrency(value: number): number {
  return Math.round(value);
}

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
    // string that predates validations/branch.schema.ts's IANA check.
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

// §8.2/§8.3: agent and branch come from the session, never the request
// body. Price, discount validity, and revenue split are all computed here
// from data fetched fresh from the database, never trusted from the client.
export async function createTransaction(
  user: SessionUser,
  input: CreateTransactionInput,
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

  const subtotal = service.price;
  if (input.discountAmount > subtotal) {
    throw Errors.businessRule("Discount cannot exceed the service price.");
  }

  const total = subtotal - input.discountAmount;
  // Split the post-discount total so a discount is shared proportionally
  // rather than one side absorbing it entirely; employeeRevenue is the
  // remainder (not its own percentage-of-total calc) so the two always sum
  // exactly to `total` with no floating-point drift.
  const ownerRevenue = roundCurrency(
    total * (service.revenueSharing.ownerPercentage / 100),
  );
  const employeeRevenue = total - ownerRevenue;

  const transactionCode = await generateUniqueTransactionCode(branch.timezone);

  const isCash = input.paymentMethod === "CASH";

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
    paymentStatus: isCash ? "PAID" : "PENDING",
    serviceHourType: input.serviceHourType,
    subtotal,
    discountAmount: input.discountAmount,
    total,
    ownerRevenue,
    employeeRevenue,
    paidAt: isCash ? new Date() : undefined,
  });

  if (isCash) {
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
