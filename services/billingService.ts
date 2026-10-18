// @/services/billingService.ts

import {
  calculateNextBillingPeriod,
  generateInvoiceCode,
  isSubscriptionOrderId,
} from "@/lib/billing";
import { Errors } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createQrisCharge, getTransactionStatus } from "@/lib/midtrans";
import { connectDB } from "@/lib/mongodb";
import {
  buildPaginationMeta,
  type PaginationMeta,
  paginateQueries,
  paginationSkip,
  stableSort,
} from "@/lib/pagination";
import SubscriptionModel from "@/models/Subscription";
import type { ISubscriptionInvoice } from "@/models/SubscriptionInvoice";
import SubscriptionInvoiceModel from "@/models/SubscriptionInvoice";
import SubscriptionPlanModel from "@/models/SubscriptionPlan";
// Type-only import: no runtime cycle with paymentService, which dynamically
// imports this module.
import type { NotificationResult } from "@/services/paymentService";
import type { ListSubscriptionInvoicesQuery } from "@/validations/subscriptionSchema";

// `pages` is the legacy name for `totalPages` — this service was the only one
// that ever used it (docs/PAGINATION-CONTRACT.md §9.1). Both are emitted for
// one release so mobile builds already in the field keep working; `pages` and
// this interface go away once they have migrated to `totalPages`.
interface PaginationInfoWithLegacyPages extends PaginationMeta {
  /** @deprecated Use `totalPages`. Identical value, kept for compatibility. */
  pages: number;
}

function withLegacyPages(meta: PaginationMeta): PaginationInfoWithLegacyPages {
  return { ...meta, pages: meta.totalPages };
}

export async function generateSubscriptionInvoice(
  subscriptionId: string,
): Promise<ISubscriptionInvoice> {
  await connectDB();

  const subscription = await SubscriptionModel.findById(subscriptionId);
  if (!subscription) {
    throw Errors.notFound("Subscription");
  }

  // Loaded by id rather than .populate("plan") + .populated("plan"): the
  // latter returns the populated _id, NOT the document. Reading
  // plan.price/plan.billingCycle off an ObjectId yielded undefined, which
  // made `amount` fail its required-field validation and silently pushed
  // calculateNextBillingPeriod() down its ANNUAL branch — a monthly plan
  // would have been invoiced for a year-long period.
  const plan = await SubscriptionPlanModel.findById(subscription.plan);
  if (!plan) {
    throw Errors.notFound("Subscription Plan");
  }

  // Calculate new billing period
  const billingPeriod = calculateNextBillingPeriod(
    subscription.currentPeriodEnd,
    plan.billingCycle,
  );

  // Generate invoice code and order ID
  const { code: invoiceCode, orderId: providerOrderId } = generateInvoiceCode();

  // Calculate due date (typically immediate or a few days later)
  const dueAt = new Date();
  dueAt.setDate(dueAt.getDate() + 3); // Due in 3 days

  // Create QRIS charge with Midtrans
  let qrCodeUrl: string | null = null;
  let qrString: string | null = null;
  let expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 15); // QRIS expires in 15 min

  try {
    const chargeResult = await createQrisCharge(
      {
        orderId: providerOrderId,
        grossAmount: plan.price,
      },
      "BILLING",
    );

    qrCodeUrl = chargeResult.qrCodeUrl;
    qrString = chargeResult.qrString;
    expiresAt = chargeResult.expiresAt;
  } catch (error) {
    throw Errors.paymentGateway(
      `Failed to create QRIS charge for invoice: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // Create invoice document
  const invoice = new SubscriptionInvoiceModel({
    subscription: subscriptionId,
    host: subscription.host,
    invoiceCode,
    periodStart: billingPeriod.start,
    periodEnd: billingPeriod.end,
    amount: plan.price,
    status: "PENDING",
    dueAt,
    provider: "MIDTRANS",
    providerOrderId,
    qrCodeUrl,
    qrString,
    expiresAt,
  });

  await invoice.save();

  return invoice.toObject();
}

export async function getInvoiceById(
  invoiceId: string,
): Promise<ISubscriptionInvoice | null> {
  await connectDB();

  const invoice = await SubscriptionInvoiceModel.findById(invoiceId)
    .populate("subscription")
    .lean();

  if (!invoice) {
    throw Errors.notFound("Invoice");
  }

  return invoice;
}

// Takes the parsed query object rather than loose (page, limit) positionals so
// a new filter cannot be added to the schema and then silently dropped on the
// way in — which is exactly what happened to `status` before this change
// (docs/PAGINATION-CONTRACT.md §9.3: it validated, then never reached the
// query, so ?status=PAID returned invoices of every status with a 200).
export async function listInvoicesBySubscription(
  subscriptionId: string,
  query: ListSubscriptionInvoicesQuery,
): Promise<{
  invoices: ISubscriptionInvoice[];
  pagination: PaginationInfoWithLegacyPages;
}> {
  await connectDB();

  const filter: Record<string, unknown> = { subscription: subscriptionId };
  if (query.status) {
    filter.status = query.status;
  }

  const { items, pagination } = await paginateQueries(
    SubscriptionInvoiceModel.find(filter)
      .sort(stableSort({ createdAt: -1 }))
      .skip(paginationSkip(query))
      .limit(query.limit)
      .lean(),
    SubscriptionInvoiceModel.countDocuments(filter),
    query,
  );

  return { invoices: items, pagination: withLegacyPages(pagination) };
}

// The "HOST has no Subscription record yet" path in the route needs a
// well-formed envelope too, built from the query the client actually sent
// rather than hardcoded defaults (§9.2).
export function emptyInvoicePage(query: ListSubscriptionInvoicesQuery): {
  invoices: ISubscriptionInvoice[];
  pagination: PaginationInfoWithLegacyPages;
} {
  return {
    invoices: [],
    pagination: withLegacyPages(buildPaginationMeta(query, 0)),
  };
}

type InvoiceStatus = "PENDING" | "PAID" | "FAILED" | "EXPIRED" | "REFUNDED";

// Midtrans's transaction_status vocabulary mapped to SubscriptionInvoice.status
// (models/SubscriptionInvoice.ts). An unrecognized status is deliberately
// absent rather than defaulting to PENDING — see below.
const INVOICE_STATUS_MAP: Record<string, InvoiceStatus | undefined> = {
  capture: "PAID",
  settlement: "PAID",
  pending: "PENDING",
  deny: "FAILED",
  cancel: "EXPIRED",
  expire: "EXPIRED",
  refund: "REFUNDED",
  partial_refund: "REFUNDED",
};

// §9.4: a settled invoice must never walk back to PENDING just because a
// stale notification arrived late. Mirrors ALLOWED_TRANSITIONS in
// paymentService.ts, which the POS path has always had and this path did not.
const ALLOWED_INVOICE_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  PENDING: ["PENDING", "PAID", "FAILED", "EXPIRED"],
  PAID: ["PAID", "REFUNDED"],
  FAILED: ["FAILED"],
  EXPIRED: ["EXPIRED"],
  REFUNDED: ["REFUNDED"],
};

// Signature verification happens in routeMidtransNotification() before this
// is reached (§23.5) — never call this from an unverified path.
//
// Returns rather than throws for "nothing to apply" outcomes so the webhook
// route can still ack 200: a notification Midtrans would keep retrying
// forever is worse than one that is acknowledged and ignored. Previously an
// unknown invoice threw Errors.notFound("Invoice"), which surfaced as a 404
// and left Midtrans retrying indefinitely.
export async function processSubscriptionInvoiceNotification(
  providerOrderId: string,
): Promise<NotificationResult> {
  await connectDB();

  // Verify this is a subscription invoice by prefix
  if (!isSubscriptionOrderId(providerOrderId)) {
    throw Errors.businessRule("Not a subscription invoice");
  }

  const invoice = await SubscriptionInvoiceModel.findOne({ providerOrderId });
  if (!invoice) {
    logger.warn("Midtrans notification for unknown subscription invoice", {
      orderId: providerOrderId,
    });
    return { applied: false, reason: "unknown_order" };
  }

  // Re-fetch authoritative status from Midtrans — the webhook body is never
  // trusted for anything beyond routing (§9.2 step 2).
  const midtransStatus = await getTransactionStatus(providerOrderId, "BILLING");

  const newStatus = INVOICE_STATUS_MAP[midtransStatus.transactionStatus];
  if (!newStatus) {
    logger.warn("Unrecognized Midtrans transaction_status for invoice", {
      status: midtransStatus.transactionStatus,
      orderId: providerOrderId,
    });
    return { applied: false, reason: "unmapped_status" };
  }

  const currentStatus = invoice.status as InvoiceStatus;

  if (currentStatus === newStatus) {
    // Idempotent: record that we heard from Midtrans, change nothing else.
    invoice.lastNotificationAt = new Date();
    await invoice.save();
    return { applied: true, reason: "idempotent_no_op" };
  }

  if (!ALLOWED_INVOICE_TRANSITIONS[currentStatus].includes(newStatus)) {
    logger.warn("Rejected invalid subscription invoice status transition", {
      invoiceId: invoice._id.toString(),
      from: currentStatus,
      to: newStatus,
    });
    return { applied: false, reason: "invalid_transition" };
  }

  invoice.status = newStatus;
  invoice.lastNotificationAt = new Date();

  if (newStatus === "PAID" && !invoice.paidAt) {
    invoice.paidAt = new Date();
  }

  if (midtransStatus.providerTransactionId) {
    invoice.providerTransactionId = midtransStatus.providerTransactionId;
  }

  await invoice.save();

  if (newStatus === "PAID") {
    // Loaded by id rather than via .populate("subscription"): Mongoose's
    // doc.populated(path) returns the populated _id, NOT the document, so
    // the previous code called .save() on an ObjectId and threw a
    // TypeError on exactly the path that activates a paid subscription.
    const subscription = await SubscriptionModel.findById(invoice.subscription);
    if (subscription) {
      subscription.status = "ACTIVE";
      subscription.currentPeriodStart = invoice.periodStart;
      subscription.currentPeriodEnd = invoice.periodEnd;
      subscription.graceEndsAt = undefined;
      await subscription.save();
    }
  }

  return { applied: true, reason: "status_updated" };
}

export async function expireOverdueInvoices(): Promise<number> {
  await connectDB();

  const now = new Date();
  const result = await SubscriptionInvoiceModel.updateMany(
    {
      status: "PENDING",
      expiresAt: { $lt: now },
    },
    {
      $set: { status: "EXPIRED" },
    },
  );

  return result.modifiedCount || 0;
}

export async function expireOverdueSubscriptions(): Promise<number> {
  await connectDB();

  const now = new Date();
  const result = await SubscriptionModel.updateMany(
    {
      status: "PAST_DUE",
      graceEndsAt: { $lt: now },
    },
    {
      $set: { status: "EXPIRED" },
    },
  );

  return result.modifiedCount || 0;
}
