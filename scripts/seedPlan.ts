#!/usr/bin/env node

/**
 * SubscriptionPlan Seed Script
 *
 * Creates the default SubscriptionPlan (PRD §23.1/§23.7) if one doesn't
 * already exist. Run this BEFORE `seed:host` on a fresh deployment — the
 * HOST's initial Subscription (bootstrapped by seed:host) needs a plan to
 * reference.
 *
 * Optional env overrides (all have sane defaults):
 *   SEED_PLAN_CODE, SEED_PLAN_NAME, SEED_PLAN_PRICE
 *
 * Usage (reads .env.local automatically):
 *   npm run seed:plan
 */

import mongoose from "mongoose";
import { seedSubscriptionPlan } from "./seedSubscriptionPlan";

seedSubscriptionPlan()
  .then(async () => {
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    console.error(
      "Seed failed:",
      error instanceof Error ? error.message : String(error),
    );
    await mongoose.disconnect();
    process.exit(1);
  });
