#!/usr/bin/env node

/**
 * HOST Seed Script
 *
 * Creates the initial HOST account for a freshly provisioned deployment
 * (PRD §3.5). This script is the ONLY way to get the first HOST in: POST
 * /users requires an already-authenticated HOST (app/api/v1/users/route.ts),
 * and GROOMA_ADMIN is blocked from that endpoint — so without this, a brand
 * new deployment has no HOST and no way to create one.
 *
 * Every subsequent HOST/AGENT for that business is created normally through
 * POST /users by this account.
 *
 * Required env: SEED_HOST_USERNAME, SEED_HOST_PASSWORD, SEED_HOST_NAME
 * (plus MONGODB_URI and SESSION_SECRET, as with any entry point).
 *
 * Usage:
 *   SEED_HOST_USERNAME=owner SEED_HOST_PASSWORD='...' SEED_HOST_NAME='...' \
 *     bun scripts/seedHost.ts
 */

import { runSeed } from "./seedUser";

runSeed({
  role: "HOST",
  usernameEnv: "SEED_HOST_USERNAME",
  passwordEnv: "SEED_HOST_PASSWORD",
  nameEnv: "SEED_HOST_NAME",
});
