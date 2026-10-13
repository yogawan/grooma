// @/services/payment.service.ts
import type { SessionUser } from "@/lib/auth";
import { requireBranchAccess } from "@/lib/authorization";
import { Errors } from "@/lib/errors";
import { logger } from "@/lib/logger";
import {
  createQrisCharge,
  getTransactionStatus,
  type MidtransNotificationPayload,
  verifyNotificationSignature,
} from "@/lib/midtrans";
import { connectDB } from "@/lib/mongodb";
import { escapeRegex, extractRefId } from "@/lib/utils";
import PaymentModel from "@/models/Payment";
import TransactionModel from "@/models/Transaction";

interface TransactionForPayment {
  _id: unknown;
  transactionCode: string;
  total: number;
}

// Each regeneration gets its own order id (suffixed -R2, -R3, ...) so
// Midtrans never sees a duplicate order_id, while staying prefixed with the
// original GRM-YYYYMMDD-XXXXXX code so Phase 8's prefix-based webhook
// routing (§9.5) still works unmodified.
async function buildProviderOrderId(transactionCode: string): Promise<string> {
  const existingCount = await PaymentModel.countDocuments({
    providerOrderId: { $regex: `^${escapeRegex(transactionCode)}` },
  });

  return existingCount === 0
    ? transactionCode
    : `${transactionCode}-R${existingCount + 1}`;
}

export async function createQrisPaymentForTransaction(
  transaction: TransactionForPayment,
) {
  await connectDB();

  const providerOrderId = await buildProviderOrderId(
    transaction.transactionCode,
  );
  const charge = await createQrisCharge({
    orderId: providerOrderId,
    grossAmount: transaction.total,
  });

  return PaymentModel.create({
    transaction: transaction._id,
    provider: "MIDTRANS",
    providerOrderId: charge.providerOrderId,
    providerTransactionId: charge.providerTransactionId,
    paymentType: "qris",
    status: "PENDING",
    grossAmount: charge.grossAmount,
    currency: "IDR",
    qrCodeUrl: charge.qrCodeUrl,
    qrString: charge.qrString,
    expiresAt: charge.expiresAt,
  });
}

export async function createQrisPayment(
  user: SessionUser,
  transactionId: string,
) {
  await connectDB();

  const transaction = await TransactionModel.findById(transactionId);
  if (!transaction) {
    throw Errors.notFound("Transaction not found.");
  }

  requireBranchAccess(user, extractRefId(transaction.branch));

  if (transaction.paymentMethod !== "QRIS") {
    throw Errors.businessRule("Transaction payment method is not QRIS.");
  }
  if (transaction.paymentStatus === "PAID") {
    throw Errors.conflict("Transaction is already paid.");
  }
  if (transaction.transactionStatus === "CANCELLED") {
    throw Errors.conflict(
      "Cannot create a payment for a cancelled transaction.",
    );
  }

  const existingPending = await PaymentModel.findOne({
    transaction: transaction._id,
    status: "PENDING",
  }).sort({ createdAt: -1 });

  if (existingPending) {
    if (existingPending.expiresAt && existingPending.expiresAt > new Date()) {
      throw Errors.conflict(
        "A pending payment already exists for this transaction.",
      );
    }
    // Past its own expiry with no notification yet — treat as expired so a
    // fresh QRIS can be generated instead of blocking forever.
    existingPending.status = "EXPIRED";
    await existingPending.save();
  }

  return createQrisPaymentForTransaction(transaction);
}

export async function getPaymentById(user: SessionUser, id: string) {
  await connectDB();

  const payment = await PaymentModel.findById(id).populate(
    "transaction",
    "branch transactionCode",
  );
  if (!payment) {
    throw Errors.notFound("Payment not found.");
  }

  const transaction = payment.transaction as unknown as {
    branch: unknown;
  } | null;
  if (!transaction) {
    throw Errors.notFound("Payment not found.");
  }

  requireBranchAccess(user, extractRefId(transaction.branch));
  return payment;
}

type InternalPaymentStatus =
  | "PENDING"
  | "PAID"
  | "FAILED"
  | "EXPIRED"
  | "REFUNDED";

// Midtrans's transaction_status vocabulary mapped to our Payment.status.
const STATUS_MAP: Record<string, InternalPaymentStatus | undefined> = {
  settlement: "PAID",
  capture: "PAID",
  pending: "PENDING",
  deny: "FAILED",
  cancel: "FAILED",
  failure: "FAILED",
  expire: "EXPIRED",
  refund: "REFUNDED",
  partial_refund: "REFUNDED",
};

// §9.4: successful/terminal payments never move backward to PENDING, and
// terminal states don't move at all except PAID -> REFUNDED.
const ALLOWED_TRANSITIONS: Record<
  InternalPaymentStatus,
  InternalPaymentStatus[]
> = {
  PENDING: ["PENDING", "PAID", "FAILED", "EXPIRED"],
  PAID: ["PAID", "REFUNDED"],
  FAILED: ["FAILED"],
  EXPIRED: ["EXPIRED"],
  REFUNDED: ["REFUNDED"],
};

function isNotificationPayload(
  body: unknown,
): body is MidtransNotificationPayload {
  return (
    typeof body === "object" &&
    body !== null &&
    "order_id" in body &&
    "status_code" in body &&
    "gross_amount" in body &&
    "signature_key" in body
  );
}

export interface NotificationResult {
  applied: boolean;
  reason: string;
}

// §9.2/§9.3: verify signature, re-fetch the authoritative status directly
// from Midtrans (never trust the webhook body beyond routing), validate the
// amount, then apply an idempotent, backward-transition-proof status
// change. "Nothing to apply" outcomes (unknown order, stale/duplicate
// notification, unmapped status) are not errors — they return normally so
// the route can still ack with 200 and stop Midtrans from retrying forever.
export async function processMidtransNotification(
  rawBody: unknown,
): Promise<NotificationResult> {
  await connectDB();

  if (!isNotificationPayload(rawBody)) {
    throw Errors.validation("Malformed Midtrans notification payload.");
  }

  if (!verifyNotificationSignature(rawBody)) {
    logger.warn("Midtrans notification signature mismatch", {
      orderId: rawBody.order_id,
    });
    throw Errors.forbidden("Invalid notification signature.");
  }

  const authoritative = await getTransactionStatus(rawBody.order_id);

  const payment = await PaymentModel.findOne({
    providerOrderId: authoritative.providerOrderId,
  });
  if (!payment) {
    logger.warn("Midtrans notification for unknown providerOrderId", {
      orderId: rawBody.order_id,
    });
    return { applied: false, reason: "unknown_order" };
  }

  if (Math.abs(authoritative.grossAmount - payment.grossAmount) > 0.5) {
    logger.error("Midtrans notification amount mismatch", {
      orderId: rawBody.order_id,
      expected: payment.grossAmount,
      actual: authoritative.grossAmount,
    });
    throw Errors.validation("Amount mismatch.");
  }

  const mappedStatus = STATUS_MAP[authoritative.transactionStatus];
  if (!mappedStatus) {
    logger.warn("Unrecognized Midtrans transaction_status", {
      status: authoritative.transactionStatus,
    });
    return { applied: false, reason: "unmapped_status" };
  }

  const currentStatus = payment.status as InternalPaymentStatus;

  if (mappedStatus === currentStatus) {
    payment.lastNotificationAt = new Date();
    await payment.save();
    return { applied: true, reason: "idempotent_no_op" };
  }

  if (!ALLOWED_TRANSITIONS[currentStatus].includes(mappedStatus)) {
    logger.warn("Rejected invalid Midtrans payment status transition", {
      paymentId: payment._id.toString(),
      from: currentStatus,
      to: mappedStatus,
    });
    return { applied: false, reason: "invalid_transition" };
  }

  payment.status = mappedStatus;
  payment.providerTransactionId = authoritative.providerTransactionId;
  payment.lastNotificationAt = new Date();
  if (mappedStatus === "PAID") {
    payment.paidAt = new Date();
  }
  await payment.save();

  const transaction = await TransactionModel.findById(payment.transaction);
  if (transaction) {
    if (mappedStatus === "PAID") {
      transaction.paymentStatus = "PAID";
      transaction.paidAt = payment.paidAt ?? new Date();
      transaction.paymentReference = payment.providerOrderId;
      await transaction.save();
    } else if (mappedStatus === "FAILED") {
      transaction.paymentStatus = "FAILED";
      await transaction.save();
    } else if (mappedStatus === "REFUNDED") {
      transaction.paymentStatus = "REFUNDED";
      await transaction.save();
    }
    // EXPIRED: only the Payment record reflects that (its own status enum
    // includes EXPIRED, Transaction.paymentStatus doesn't — §5.5); the
    // transaction correctly stays PENDING since it's still payable via a
    // freshly generated QRIS.
  }

  return { applied: true, reason: "status_updated" };
}
