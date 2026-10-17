// @/services/paymentService.ts
import type { SessionUser } from "@/lib/auth";
import { requireBranchAccess } from "@/lib/authorization";
import { Errors } from "@/lib/errors";
import { logger } from "@/lib/logger";
import {
  createQrisCharge,
  getTransactionStatus,
  type MidtransCredentialSet,
  type MidtransNotificationPayload,
  verifyNotificationSignature,
} from "@/lib/midtrans";
import { connectDB } from "@/lib/mongodb";
import { getPaymentIntegrationMode } from "@/lib/paymentConfig";
import { escapeRegex, extractRefId } from "@/lib/utils";
import PaymentModel from "@/models/Payment";
import TransactionModel from "@/models/Transaction";
import { creditLoyaltyPoints } from "@/services/customerService";

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
  const charge = await createQrisCharge(
    {
      orderId: providerOrderId,
      grossAmount: transaction.total,
    },
    "POS",
  );

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

  // §9.6: a SELF_RECORDED deployment's host collects via its own QRIS
  // outside Grooma, so there is no Midtrans order to create here. Checked
  // before the already-paid guard below, which such a transaction would
  // also trip — but with a message that misleads about why.
  if (getPaymentIntegrationMode() === "SELF_RECORDED") {
    throw Errors.businessRule(
      "This host records QRIS payments outside Grooma; no payment order is created.",
    );
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

  if (!verifyNotificationSignature(rawBody, "POS")) {
    logger.warn("Midtrans notification signature mismatch", {
      orderId: rawBody.order_id,
    });
    throw Errors.forbidden("Invalid notification signature.");
  }

  const authoritative = await getTransactionStatus(rawBody.order_id, "POS");

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
      // Atomic and conditional — the counterpart to cancelTransaction's own
      // atomic transition (§9.2/§14). A late-arriving settlement for a
      // transaction that was cancelled in the meantime must never mark it
      // PAID or award points; this filter makes that impossible regardless
      // of which request reaches MongoDB first, not just in the common
      // ordering where the cancel happens first.
      const updated = await TransactionModel.findOneAndUpdate(
        { _id: transaction._id, transactionStatus: { $ne: "CANCELLED" } },
        {
          $set: {
            paymentStatus: "PAID",
            paidAt: payment.paidAt ?? new Date(),
            paymentReference: payment.providerOrderId,
          },
        },
        { new: true },
      );

      if (!updated) {
        logger.warn(
          "Ignored Midtrans settlement for an already-cancelled transaction",
          { transactionId: transaction._id.toString() },
        );
        return { applied: false, reason: "transaction_cancelled" };
      }

      // This branch only runs on a real PENDING->PAID transition (the
      // idempotent-replay check above already returned early for a
      // duplicate "settlement" notification), so a retried webhook can
      // never double-credit the same transaction's points.
      if (updated.customer) {
        try {
          await creditLoyaltyPoints(updated.customer, updated.pointsEarned);
        } catch (error) {
          logger.error(
            "Failed to credit loyalty points on payment settlement",
            {
              transactionId: updated._id.toString(),
              customerId: String(updated.customer),
              message: error instanceof Error ? error.message : String(error),
            },
          );
        }
      }
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

// §9.5: Route Midtrans notification to Payment or SubscriptionInvoice
// handler based on providerOrderId prefix.
//
// §23.5 requires the subscription path to enforce the same signature
// verification as the POS path with no shortcut, so verification happens
// HERE — before the prefix is even looked at. It previously lived only
// inside processMidtransNotification(), which left the GRM-SUB branch
// reachable by anyone who could POST to the public webhook route.
// processMidtransNotification() keeps its own check as defense in depth: it
// is exported, so it must stay safe when called directly.
export async function routeMidtransNotification(
  rawBody: unknown,
): Promise<NotificationResult> {
  if (!isNotificationPayload(rawBody)) {
    throw Errors.validation("Malformed Midtrans notification payload.");
  }

  // Prefix decides which Midtrans ACCOUNT this notification belongs to
  // (§9.5/§23.8) — checked before signature verification because the
  // signature itself can only be checked against the matching account's
  // own server key. This is still safe: the prefix isn't trusted for
  // anything business-critical here, only for which known key to try: an
  // attacker claiming the wrong prefix just fails verification against
  // that account's key instead, exactly as before.
  const orderId = rawBody.order_id;
  const isSubscriptionNotification = orderId.startsWith("GRM-SUB");
  const credentialSet: MidtransCredentialSet = isSubscriptionNotification
    ? "BILLING"
    : "POS";

  if (!verifyNotificationSignature(rawBody, credentialSet)) {
    logger.warn("Midtrans notification signature mismatch", {
      orderId: rawBody.order_id,
    });
    throw Errors.forbidden("Invalid notification signature.");
  }

  if (isSubscriptionNotification) {
    // SubscriptionInvoice notification — route to billing service
    const { processSubscriptionInvoiceNotification } = await import(
      "./billingService"
    );
    return processSubscriptionInvoiceNotification(orderId);
  }

  // POS Transaction payment notification — use existing handler
  return processMidtransNotification(rawBody);
}
