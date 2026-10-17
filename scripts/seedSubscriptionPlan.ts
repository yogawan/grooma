// @/scripts/seedSubscriptionPlan.ts
//
// Bootstrap logic for the default SubscriptionPlan (PRD §23.1/§23.7).
// Not runnable on its own — import it (see scripts/seedPlan.ts for the CLI
// entry point). SubscriptionPlan management otherwise belongs to the admin
// backend (§3.6) — this is a one-off provisioning convenience, not a CRUD
// endpoint, and doesn't reintroduce any admin surface into this backend.
// Needed before `seed:host` can bootstrap a HOST's initial Subscription,
// since that Subscription must reference an existing plan.
//
// Optional env overrides (all have defaults matching PRD §23.1):
//   SEED_PLAN_CODE, SEED_PLAN_NAME, SEED_PLAN_PRICE

import { connectDB } from "@/lib/mongodb";
import SubscriptionPlanModel from "@/models/SubscriptionPlan";

const DEFAULT_CODE = "STANDARD";
const DEFAULT_NAME = "Standard";
const DEFAULT_PRICE = 50000; // PRD §23.1: Rp50.000/bulan

export async function seedSubscriptionPlan(): Promise<void> {
  const code = process.env.SEED_PLAN_CODE?.trim() || DEFAULT_CODE;
  const name = process.env.SEED_PLAN_NAME?.trim() || DEFAULT_NAME;

  let price = DEFAULT_PRICE;
  if (process.env.SEED_PLAN_PRICE !== undefined) {
    price = Number(process.env.SEED_PLAN_PRICE);
    if (Number.isNaN(price) || price < 0) {
      throw new Error(
        `SEED_PLAN_PRICE must be a non-negative number (got "${process.env.SEED_PLAN_PRICE}").`,
      );
    }
  }

  await connectDB();

  const existing = await SubscriptionPlanModel.findOne({ code });
  if (existing) {
    console.log(
      `SubscriptionPlan "${existing.code}" already exists (id: ${existing._id}, price: ${existing.price}). Skipping.`,
    );
    return;
  }

  const created = await SubscriptionPlanModel.create({ code, name, price });

  console.log(
    `Created SubscriptionPlan "${created.code}" (id: ${created._id}, price: ${created.price} ${created.currency}/${created.billingCycle.toLowerCase()}).`,
  );
}
