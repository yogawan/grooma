// @/scripts/seedUser.ts
//
// Seeding logic behind scripts/seedHost.ts. Not runnable on its own — import
// it. It kept a role option back when scripts/seedAdmin.ts was the second
// caller; that script moved to the admin backend along with GROOMA_ADMIN, so
// HOST is now the only role this service can seed.
//
// Credentials come from environment variables with no hardcoded fallback:
// Grooma runs one deployment per HOST (PRD §3.5), so a baked-in default
// password would mean every deployment on the fleet shares it, and one
// leaked credential would open all of them.

import mongoose from "mongoose";
import { hashPassword } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import SubscriptionModel from "@/models/Subscription";
import SubscriptionPlanModel from "@/models/SubscriptionPlan";
import UserModel from "@/models/User";

export interface SeedUserOptions {
  role: "HOST";
  usernameEnv: string;
  passwordEnv: string;
  nameEnv: string;
  phoneEnv?: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable ${name}.`);
  }
  return value;
}

// Trimmed: these are identifiers, and the schema trims them on save anyway.
function requireTrimmedEnv(name: string): string {
  return requireEnv(name).trim();
}

// Unlike username/password/name, phone has no required-env-var counterpart —
// it's optional on the model itself, so a blank/unset value here just means
// "don't set it," not "fail."
function optionalTrimmedEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

// Bootstraps the free-trial Subscription a HOST needs before the existing
// billing-cycle cron (services/billingService.ts) can ever pick it up —
// PRD §23.7. Deliberately runs for BOTH a brand-new HOST and one that
// already existed without a Subscription yet (e.g. a HOST seeded before
// this bootstrap step existed): the goal is "every HOST this script
// resolves to ends up with exactly one Subscription," not just "new
// accounts get one." Subscription.host has a unique index, so even a
// concurrent double-run can't create two for the same HOST.
async function ensureInitialSubscription(hostId: unknown): Promise<void> {
  const existingSubscription = await SubscriptionModel.findOne({
    host: hostId,
  });
  if (existingSubscription) {
    console.log(
      `Subscription already exists for this HOST (id: ${existingSubscription._id}, status: ${existingSubscription.status}). Skipping.`,
    );
    return;
  }

  // Arbitrary but deterministic: the oldest active plan. There is only ever
  // one plan in practice today (scripts/seedPlan.ts bootstraps exactly one),
  // so this isn't a real choice yet — revisit if/when multiple plans exist
  // and seed:host needs a way to pick among them.
  const plan = await SubscriptionPlanModel.findOne({ isActive: true }).sort({
    createdAt: 1,
  });
  if (!plan) {
    throw new Error(
      "No active SubscriptionPlan exists yet. Run `npm run seed:plan` first " +
        "— the HOST's initial Subscription needs a plan to reference (PRD §23.7).",
    );
  }

  const currentPeriodStart = new Date();
  const currentPeriodEnd = new Date(currentPeriodStart);
  currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);

  const subscription = await SubscriptionModel.create({
    host: hostId,
    plan: plan._id,
    status: "ACTIVE",
    currentPeriodStart,
    currentPeriodEnd,
  });

  console.log(
    `Created Subscription for HOST (id: ${subscription._id}, plan: ${plan.code}). ` +
      `Free until ${currentPeriodEnd.toISOString().slice(0, 10)} — the existing billing cycle will invoice automatically after that.`,
  );
}

// Idempotent: an existing account with the same username is left untouched
// (including its password), so re-running a provisioning script is safe.
export async function seedUser(options: SeedUserOptions): Promise<void> {
  const username = requireTrimmedEnv(options.usernameEnv);
  const name = requireTrimmedEnv(options.nameEnv);
  // NOT trimmed: trimming silently hashed a different secret than the
  // operator set, so a password with a leading or trailing space would be
  // impossible to log in with.
  const password = requireEnv(options.passwordEnv);
  const phone = options.phoneEnv
    ? optionalTrimmedEnv(options.phoneEnv)
    : undefined;

  // Mirrors validations/userSchema.ts so a seeded account can't sit outside
  // the bounds the API itself enforces on every other account.
  if (username.length < 3 || username.length > 64) {
    throw new Error(
      `${options.usernameEnv} must be 3-64 characters to match the API's username rules (got ${username.length}).`,
    );
  }

  if (password.length < 8 || password.length > 128) {
    throw new Error(
      `${options.passwordEnv} must be 8-128 characters to match the API's own password policy.`,
    );
  }

  if (name.length < 1 || name.length > 100) {
    throw new Error(`${options.nameEnv} must be 1-100 characters.`);
  }

  if (phone !== undefined && phone.length > 32) {
    throw new Error(`${options.phoneEnv} must be at most 32 characters.`);
  }

  await connectDB();

  // The schema lowercases username on save, so match case-insensitively here.
  const existing = await UserModel.findOne({
    username: username.toLowerCase(),
  });

  let hostId: unknown;

  if (existing) {
    console.log(
      `User "${existing.username}" already exists (id: ${existing._id}, role: ${existing.role}). Skipping account creation.`,
    );
    hostId = existing._id;
  } else {
    // One deployment serves exactly one HOST (PRD §3.5). Seeding a second one
    // would not break isolation — they would simply share all operational data
    // — but it contradicts the deployment model and each HOST is billed its
    // own subscription, so make it an explicit refusal rather than a surprise.
    // Unconditional now that HOST is the only seedable role — this used to be
    // guarded by `if (options.role === "HOST")` so the admin seeder could skip
    // it.
    const existingHost = await UserModel.findOne({ role: "HOST" })
      .select("username")
      .lean();

    if (existingHost) {
      throw new Error(
        `This deployment already has a HOST account ("${existingHost.username}"). ` +
          "One deployment serves one HOST (PRD §3.5) — provision a separate " +
          "deployment and database for another business, or create additional " +
          "staff through POST /users as that HOST.",
      );
    }

    const created = await UserModel.create({
      username,
      password: await hashPassword(password),
      name,
      phone,
      role: options.role,
      branch: null,
      status: "ACTIVE",
    });

    console.log(
      `Created ${options.role} user "${created.username}" (id: ${created._id}).`,
    );
    hostId = created._id;
  }

  // Runs regardless of whether the account above was just created or
  // already existed — see ensureInitialSubscription's own comment for why.
  await ensureInitialSubscription(hostId);
}

export async function runSeed(options: SeedUserOptions): Promise<void> {
  try {
    await seedUser(options);
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error(
      "Seed failed:",
      error instanceof Error ? error.message : String(error),
    );
    await mongoose.disconnect();
    process.exit(1);
  }
}
