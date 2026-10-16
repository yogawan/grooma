#!/usr/bin/env node

/**
 * HOST Seed Script
 *
 * Creates the initial HOST account for a freshly provisioned deployment
 * (PRD §3.5). This script is the ONLY way to get the first HOST in: POST
 * /users requires an already-authenticated HOST (app/api/v1/users/route.ts),
 * so without this, a brand new deployment has no HOST and no way to create
 * one. The admin backend cannot stand in for it either — it shares this
 * database but deliberately has no route into the staff namespace.
 *
 * Every subsequent HOST/AGENT for that business is created normally through
 * POST /users by this account.
 *
 * Required env: SEED_HOST_USERNAME, SEED_HOST_PASSWORD, SEED_HOST_NAME
 * (plus MONGODB_URI and SESSION_SECRET, as with any entry point).
 * Optional env: SEED_HOST_PHONE — phone is optional on the model itself,
 * so this can be left unset.
 *
 * Usage (reads .env.local automatically):
 *   npm run seed:host
 *
 * Not `bun scripts/seedHost.ts` — the installed bson version's
 * startup-snapshot check throws under Bun's incomplete node:v8 shim before
 * this script's own code ever runs. tsx runs under Node, which has no such
 * gap, but does need the env vars from .env.local explicitly, hence
 * --env-file in the npm script.
 */

import { runSeed } from "./seedUser";

runSeed({
  role: "HOST",
  usernameEnv: "SEED_HOST_USERNAME",
  passwordEnv: "SEED_HOST_PASSWORD",
  nameEnv: "SEED_HOST_NAME",
  phoneEnv: "SEED_HOST_PHONE",
});
