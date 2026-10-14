// @/app/api/v1/internal/subscriptions/run-billing-cycle/route.ts
import type { NextRequest } from "next/server";
import { connectDB } from "@/lib/mongodb";
import SubscriptionModel from "@/models/Subscription";
import {
  expireOverdueInvoices,
  expireOverdueSubscriptions,
  generateSubscriptionInvoice,
} from "@/services/billingService";

const INTERNAL_CRON_SECRET = process.env.INTERNAL_CRON_SECRET;

if (!INTERNAL_CRON_SECRET) {
  throw new Error("Missing INTERNAL_CRON_SECRET environment variable");
}

export async function POST(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get("authorization");
    if (!authHeader || authHeader !== `Bearer ${INTERNAL_CRON_SECRET}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const results = {
      invoicesGenerated: 0,
      invoicesExpired: 0,
      subscriptionsExpired: 0,
    };

    // 1. Expire overdue invoices
    results.invoicesExpired = await expireOverdueInvoices();

    // 2. Expire overdue subscriptions (past grace period)
    results.subscriptionsExpired = await expireOverdueSubscriptions();

    // 3. Generate new invoices for ACTIVE subscriptions at period end
    const now = new Date();
    const subscriptions = await SubscriptionModel.find({
      status: "ACTIVE",
      currentPeriodEnd: { $lte: now },
    });

    for (const subscription of subscriptions) {
      try {
        await generateSubscriptionInvoice(subscription._id);
        results.invoicesGenerated++;
      } catch (error) {
        console.error(
          `Failed to generate invoice for subscription ${subscription._id}:`,
          error,
        );
      }
    }

    return Response.json({
      success: true,
      results,
    });
  } catch (error) {
    console.error("Billing cycle failed:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
