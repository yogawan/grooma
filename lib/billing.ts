// @/lib/billing.ts

export const SUBSCRIPTION_ORDER_ID_PREFIX = "GRM-SUB";
export const TRANSACTION_ORDER_ID_PREFIX = "GRM";

export interface BillingPeriod {
  start: Date;
  end: Date;
}

export interface InvoiceCode {
  code: string;
  orderId: string;
}

// Calculate next billing period based on plan cycle
export function calculateNextBillingPeriod(
  currentPeriodEnd: Date,
  billingCycle: "MONTHLY" | "ANNUAL",
): BillingPeriod {
  const start = new Date(currentPeriodEnd);
  start.setDate(start.getDate() + 1); // Next day after current period ends

  const end = new Date(start);
  if (billingCycle === "MONTHLY") {
    end.setMonth(end.getMonth() + 1);
  } else {
    end.setFullYear(end.getFullYear() + 1);
  }
  end.setDate(end.getDate() - 1); // Last day of billing period

  return { start, end };
}

// Generate unique invoice code with GRM-SUB prefix
export function generateInvoiceCode(): InvoiceCode {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = now.getFullYear();
  const random = Math.floor(Math.random() * 1000000)
    .toString()
    .padStart(6, "0");

  const code = `SUB-${year}${month}-${random}`;
  const orderId = `${SUBSCRIPTION_ORDER_ID_PREFIX}-${code}`;

  return { code, orderId };
}

// Check if an invoice is distinguishable from POS transactions by provider order ID
export function isSubscriptionOrderId(providerOrderId: string): boolean {
  return providerOrderId.startsWith(SUBSCRIPTION_ORDER_ID_PREFIX);
}

// Calculate grace period end date
export function calculateGracePeriodEnd(
  dueDate: Date,
  graceDays: number,
): Date {
  const graceEnd = new Date(dueDate);
  graceEnd.setDate(graceEnd.getDate() + graceDays);
  return graceEnd;
}

// Determine subscription status based on invoice status and grace period
export function determineSubscriptionStatus(
  invoiceStatus: string,
  graceEndsAt: Date | undefined,
): "ACTIVE" | "PAST_DUE" | "EXPIRED" | "CANCELLED" {
  if (invoiceStatus === "PAID") {
    return "ACTIVE";
  }

  if (invoiceStatus === "FAILED" || invoiceStatus === "EXPIRED") {
    const now = new Date();
    if (graceEndsAt && now > graceEndsAt) {
      return "EXPIRED";
    }
    return "PAST_DUE";
  }

  return "ACTIVE";
}

// Type-safe plan interface for billing calculations
export interface PlanForBilling {
  billingCycle: "MONTHLY" | "ANNUAL";
  graceDays: number;
  price: number;
  currency: string;
}
