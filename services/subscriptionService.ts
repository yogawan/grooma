// @/services/subscriptionService.ts
//
// HOST-facing subscription reads only. Plan CRUD and the platform-wide
// subscription list / manual status override were GROOMA_ADMIN operations
// and now live in the separate admin backend that shares this database.
// Writes to Subscription from this service are the billing cycle's job
// (services/billingService.ts), not an operator's.

import { connectDB } from "@/lib/mongodb";
import type { ISubscription } from "@/models/Subscription";
import SubscriptionModel from "@/models/Subscription";
// Imported for its side effect: `.populate("plan")` below resolves the
// "SubscriptionPlan" model through Mongoose's registry, which only has it
// once this module has been loaded. Nothing else on the /subscription route's
// import path pulls it in, so dropping this line makes the populate throw
// MissingSchemaError at runtime rather than failing at build.
import "@/models/SubscriptionPlan";

export async function getSubscriptionByHostId(
  hostId: string,
): Promise<ISubscription | null> {
  await connectDB();

  const subscription = await SubscriptionModel.findOne({ host: hostId })
    .populate("plan")
    .lean();

  if (!subscription) {
    return null;
  }

  return subscription;
}

// Helper: Get HOST's subscription status for access control
export async function getHostSubscriptionStatus(
  hostId: string,
): Promise<string | null> {
  await connectDB();

  const subscription = await SubscriptionModel.findOne({ host: hostId }).lean();

  return subscription?.status || null;
}

// Helper: Check if HOST has active subscription
export async function isHostSubscriptionActive(
  hostId: string,
): Promise<boolean> {
  const status = await getHostSubscriptionStatus(hostId);
  return status === "ACTIVE";
}
