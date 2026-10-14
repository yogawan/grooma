// @/services/branchService.ts
import type { SessionUser } from "@/lib/auth";
import { requireBranchAccess } from "@/lib/authorization";
import { Errors } from "@/lib/errors";
import { connectDB } from "@/lib/mongodb";
import BranchModel from "@/models/Branch";
import type {
  CreateBranchInput,
  SetBranchStatusInput,
  UpdateBranchInput,
} from "@/validations/branchSchema";

// `host` comes from the creating HOST's session, never the request body —
// same principle as agent/branch on a transaction (§8.3). Only HOST can
// reach this (route-level requireRole), so the session user *is* the owner.
export async function createBranch(
  user: SessionUser,
  input: CreateBranchInput,
) {
  await connectDB();
  return BranchModel.create({ ...input, host: user.id });
}

// §7.4: "List accessible branches" — HOST sees every branch, AGENT only its own.
export async function listBranches(user: SessionUser) {
  await connectDB();

  if (user.role === "HOST") {
    return BranchModel.find().sort({ name: 1 });
  }

  if (!user.branch) {
    return [];
  }

  return BranchModel.find({ _id: user.branch });
}

export async function getBranchById(user: SessionUser, id: string) {
  requireBranchAccess(user, id);

  await connectDB();
  const branch = await BranchModel.findById(id);

  if (!branch) {
    throw Errors.notFound("Branch not found.");
  }

  return branch;
}

export async function updateBranch(id: string, input: UpdateBranchInput) {
  await connectDB();
  const branch = await BranchModel.findById(id);

  if (!branch) {
    throw Errors.notFound("Branch not found.");
  }

  Object.assign(branch, input);
  await branch.save();

  return branch;
}

export async function setBranchStatus(id: string, input: SetBranchStatusInput) {
  await connectDB();
  const branch = await BranchModel.findById(id);

  if (!branch) {
    throw Errors.notFound("Branch not found.");
  }

  branch.status = input.status;
  await branch.save();

  return branch;
}
