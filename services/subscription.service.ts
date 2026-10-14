// @/services/subscription.service.ts
import type { ISubscription } from "@/models/Subscription";
import type { ISubscriptionPlan } from "@/models/SubscriptionPlan";
import { Errors } from "@/lib/errors";
import { connectDB } from "@/lib/mongodb";
import SubscriptionModel from "@/models/Subscription";
import SubscriptionPlanModel from "@/models/SubscriptionPlan";
import type {
  CreateSubscriptionPlanInput,
  UpdateSubscriptionPlanInput,
  UpdateSubscriptionStatusInput,
  ListSubscriptionsQuery,
} from "@/validations/subscription.schema";

interface SubscriptionsListResponse {
  subscriptions: ISubscription[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export async function createSubscriptionPlan(
  input: CreateSubscriptionPlanInput,
): Promise<ISubscriptionPlan> {
  await connectDB();

  // Check if code already exists
  const existing = await SubscriptionPlanModel.findOne({ code: input.code });
  if (existing) {
    throw Errors.conflict(
      `Subscription plan code '${input.code}' already exists.`,
    );
  }

  const plan = new SubscriptionPlanModel(input);
  await plan.save();

  return plan.toObject();
}

export async function updateSubscriptionPlan(
  planId: string,
  input: UpdateSubscriptionPlanInput,
): Promise<ISubscriptionPlan> {
  await connectDB();

  const plan = await SubscriptionPlanModel.findById(planId);
  if (!plan) {
    throw Errors.notFound("Subscription Plan");
  }

  Object.assign(plan, input);
  await plan.save();

  return plan.toObject();
}

export async function getSubscriptionPlan(
  planId: string,
): Promise<ISubscriptionPlan> {
  await connectDB();

  const plan = await SubscriptionPlanModel.findById(planId);
  if (!plan) {
    throw Errors.notFound("Subscription Plan");
  }

  return plan.toObject();
}

export async function listSubscriptionPlans(
  isActive?: boolean,
): Promise<ISubscriptionPlan[]> {
  await connectDB();

  const query: Record<string, unknown> = {};
  if (isActive !== undefined) {
    query.isActive = isActive;
  }

  const plans = await SubscriptionPlanModel.find(query).sort({ createdAt: -1 });

  return plans.map((p) => p.toObject());
}

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

export async function getSubscriptionById(
  subscriptionId: string,
): Promise<ISubscription> {
  await connectDB();

  const subscription = await SubscriptionModel.findById(subscriptionId)
    .populate("plan")
    .lean();

  if (!subscription) {
    throw Errors.notFound("Subscription");
  }

  return subscription;
}

export async function listSubscriptions(
  query: ListSubscriptionsQuery,
): Promise<SubscriptionsListResponse> {
  await connectDB();

  const filter: Record<string, unknown> = {};
  if (query.status) {
    filter.status = query.status;
  }
  if (query.hostId) {
    filter.host = query.hostId;
  }

  const skip = (query.page - 1) * query.limit;
  const [subscriptions, total] = await Promise.all([
    SubscriptionModel.find(filter)
      .populate("host", "username name email")
      .populate("plan")
      .skip(skip)
      .limit(query.limit)
      .sort({ createdAt: -1 })
      .lean(),
    SubscriptionModel.countDocuments(filter),
  ]);

  return {
    subscriptions,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.ceil(total / query.limit),
    },
  };
}

export async function updateSubscriptionStatus(
  subscriptionId: string,
  input: UpdateSubscriptionStatusInput,
): Promise<ISubscription> {
  await connectDB();

  const subscription = await SubscriptionModel.findById(subscriptionId);
  if (!subscription) {
    throw Errors.notFound("Subscription");
  }

  subscription.status = input.status;
  if (input.status === "CANCELLED") {
    subscription.cancelledAt = new Date();
    subscription.cancelReason = input.cancelReason;
  }

  await subscription.save();

  return subscription.toObject();
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
