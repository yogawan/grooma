// @/app/api/v1/subscription/invoices/[id]/route.ts
import type { NextRequest } from "next/server";
import { requireAuth, requireRole } from "@/lib/authorization";
import { Errors, successResponse, withErrorHandling } from "@/lib/errors";
import { getInvoiceById } from "@/services/billingService";
import { getSubscriptionByHostId } from "@/services/subscriptionService";

export const GET = withErrorHandling<{ id: string }>(
  async (request: NextRequest, { params }) => {
    const user = await requireAuth(request, { subscriptionExempt: true });
    // §3.2: subscription and invoices are the HOST's own billing data;
    // AGENT has no entry here; no other role can hold a session (§3.6).
    requireRole(user, ["HOST"]);
    const { id } = await params;

    // These were raw `new Error("NOT_FOUND"/"FORBIDDEN")`, which
    // handleApiError has no string-matching for — every one of them became a
    // 500 INTERNAL_ERROR logged as "Unhandled API error", including the
    // ordinary "someone else's invoice" case.
    const subscription = await getSubscriptionByHostId(user.id);
    if (!subscription) {
      throw Errors.notFound("Subscription not found.");
    }

    const invoice = await getInvoiceById(id);
    if (!invoice) {
      throw Errors.notFound("Invoice not found.");
    }

    // Verify invoice belongs to user's subscription
    if (String(invoice.subscription) !== String(subscription._id)) {
      throw Errors.forbidden();
    }

    return successResponse({ invoice });
  },
);
