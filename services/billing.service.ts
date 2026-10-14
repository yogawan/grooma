// @/services/billing.service.ts
import { connectDB } from "@/lib/mongodb";
import { Errors } from "@/lib/errors";
import {
  calculateNextBillingPeriod,
  generateInvoiceCode,
  calculateGracePeriodEnd,
  isSubscriptionOrderId,
} from "@/lib/billing";
import { createQrisCharge, getTransactionStatus } from "@/lib/midtrans";
import SubscriptionModel from "@/models/Subscription";
import SubscriptionInvoiceModel from "@/models/SubscriptionInvoice";

export async function generateSubscriptionInvoice(
  subscriptionId: string,
): Promise<any> {
  await connectDB();

  const subscription =
    await SubscriptionModel.findById(subscriptionId).populate("plan");
  if (!subscription) {
    throw Errors.notFound("Subscription");
  }

  const plan = subscription.populated("plan");
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

  // Calculate grace period end
  const graceEndsAt = calculateGracePeriodEnd(dueAt, plan.graceDays);

  // Create QRIS charge with Midtrans
  let qrCodeUrl: string | null = null;
  let qrString: string | null = null;
  let expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 15); // QRIS expires in 15 min

  try {
    const chargeResult = await createQrisCharge({
      orderId: providerOrderId,
      grossAmount: plan.price,
    });

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

export async function getInvoiceById(invoiceId: string): Promise<any> {
  await connectDB();

  const invoice = await SubscriptionInvoiceModel.findById(invoiceId)
    .populate("subscription")
    .lean();

  if (!invoice) {
    throw Errors.notFound("Invoice");
  }

  return invoice;
}

export async function listInvoicesBySubscription(
  subscriptionId: string,
  page: number = 1,
  limit: number = 20,
): Promise<{ invoices: any[]; pagination: any }> {
  await connectDB();

  const skip = (page - 1) * limit;
  const [invoices, total] = await Promise.all([
    SubscriptionInvoiceModel.find({ subscription: subscriptionId })
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 })
      .lean(),
    SubscriptionInvoiceModel.countDocuments({ subscription: subscriptionId }),
  ]);

  return {
    invoices,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
}

export async function processSubscriptionInvoiceNotification(
  providerOrderId: string,
): Promise<void> {
  await connectDB();

  // Verify this is a subscription invoice by prefix
  if (!isSubscriptionOrderId(providerOrderId)) {
    throw Errors.businessRule("Not a subscription invoice");
  }

  const invoice = await SubscriptionInvoiceModel.findOne({
    providerOrderId,
  }).populate("subscription");
  if (!invoice) {
    throw Errors.notFound("Invoice");
  }

  // Re-fetch authoritative status from Midtrans
  const midtransStatus = await getTransactionStatus(providerOrderId);

  // Map Midtrans status to invoice status
  const STATUS_MAP: Record<string, string> = {
    capture: "PAID",
    settlement: "PAID",
    pending: "PENDING",
    deny: "FAILED",
    cancel: "EXPIRED",
    expire: "EXPIRED",
    refund: "REFUNDED",
    partial_refund: "REFUNDED",
  };

  const newStatus = STATUS_MAP[midtransStatus.transactionStatus] || "PENDING";

  // Check if status changed
  if (invoice.status === newStatus) {
    // Idempotent: no change needed
    invoice.lastNotificationAt = new Date();
    await invoice.save();
    return;
  }

  // Update invoice status
  invoice.status = newStatus;
  invoice.lastNotificationAt = new Date();

  if (newStatus === "PAID" && !invoice.paidAt) {
    invoice.paidAt = new Date();
  }

  if (midtransStatus.providerTransactionId) {
    invoice.providerTransactionId = midtransStatus.providerTransactionId;
  }

  await invoice.save();

  // Update subscription status if invoice is paid
  const subscription = invoice.populated("subscription");
  if (subscription && newStatus === "PAID") {
    subscription.status = "ACTIVE";
    subscription.currentPeriodStart = invoice.periodStart;
    subscription.currentPeriodEnd = invoice.periodEnd;
    subscription.graceEndsAt = undefined;
    await subscription.save();
  }
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
