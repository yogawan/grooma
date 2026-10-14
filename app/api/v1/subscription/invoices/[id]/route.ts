// @/app/api/v1/subscription/invoices/[id]/route.ts
import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/authorization";
import { successResponse, withErrorHandling } from "@/lib/errors";
import { getInvoiceById } from "@/services/billingService";
import { getSubscriptionByHostId } from "@/services/subscriptionService";

export const GET = withErrorHandling<{ id: string }>(
  async (request: NextRequest, { params }) => {
    const user = await requireAuth(request);
    const { id } = await params;

    // Verify ownership: invoice must belong to user's subscription
    const subscription = await getSubscriptionByHostId(user.id);
    if (!subscription) {
      throw new Error("NOT_FOUND");
    }

    const invoice = await getInvoiceById(id);
    if (!invoice) {
      throw new Error("NOT_FOUND");
    }

    // Verify invoice belongs to user's subscription
    if (String(invoice.subscription) !== String(subscription._id)) {
      throw new Error("FORBIDDEN");
    }

    return successResponse({ invoice });
  },
);
