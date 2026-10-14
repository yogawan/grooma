#!/usr/bin/env node

/**
 * GROOMA_ADMIN Seed Script
 *
 * GROOMA_ADMIN accounts are deliberately excluded from POST/PATCH /users
 * (validations/userSchema.ts, services/userService.ts) — this script is the
 * only way to create one. Idempotent: does nothing if the username already
 * exists.
 *
 * Credentials are read from the environment rather than hardcoded: Grooma
 * deploys one instance per HOST (PRD §3.5), and a baked-in password would be
 * shared by every deployment on the fleet.
 *
 * Required env: SEED_ADMIN_USERNAME, SEED_ADMIN_PASSWORD, SEED_ADMIN_NAME
 * (plus MONGODB_URI and SESSION_SECRET, as with any entry point).
 *
 * Usage:
 *   SEED_ADMIN_USERNAME=admin SEED_ADMIN_PASSWORD='...' SEED_ADMIN_NAME='...' \
 *     bun scripts/seedAdmin.ts
 */

import { runSeed } from "./seedUser";

runSeed({
  role: "GROOMA_ADMIN",
  usernameEnv: "SEED_ADMIN_USERNAME",
  passwordEnv: "SEED_ADMIN_PASSWORD",
  nameEnv: "SEED_ADMIN_NAME",
});
