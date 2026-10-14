#!/usr/bin/env node

/**
 * GROOMA_ADMIN Seed Script
 *
 * GROOMA_ADMIN accounts are deliberately excluded from POST/PATCH /users
 * (validations/userSchema.ts, services/userService.ts) — this script is the
 * only way to create one. Idempotent: does nothing if the username already
 * exists.
 *
 * Usage:
 *   bun scripts/seedAdmin.ts
 */

import mongoose from "mongoose";
import { hashPassword } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import UserModel from "@/models/User";

const ADMIN_USERNAME = "Yogawan";
const ADMIN_PASSWORD = "Yog@pr4t4m4.grooma";
const ADMIN_NAME = "Yogawan Aditya Pratama";

async function seedAdmin() {
  await connectDB();

  // The schema lowercases username on save, so match case-insensitively here.
  const existing = await UserModel.findOne({
    username: ADMIN_USERNAME.toLowerCase(),
  });
  if (existing) {
    console.log(
      `Admin user "${existing.username}" already exists (id: ${existing._id}). Skipping.`,
    );
    return;
  }

  const password = await hashPassword(ADMIN_PASSWORD);

  const admin = await UserModel.create({
    username: ADMIN_USERNAME,
    password,
    name: ADMIN_NAME,
    role: "GROOMA_ADMIN",
    branch: null,
    status: "ACTIVE",
  });

  console.log(
    `Created GROOMA_ADMIN user "${admin.username}" (id: ${admin._id}).`,
  );
}

async function main() {
  try {
    await seedAdmin();
    process.exit(0);
  } catch (error) {
    console.error(
      "Seed failed:",
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

main();
