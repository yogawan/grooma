// @/services/branchService.ts
import type { SessionUser } from "@/lib/auth";
import { requireBranchAccess } from "@/lib/authorization";
import { Errors } from "@/lib/errors";
import { connectDB } from "@/lib/mongodb";
import {
  paginateQueries,
  paginationSkip,
  stableSort,
  toPaginated,
} from "@/lib/pagination";
import BranchModel from "@/models/Branch";
import type {
  CreateBranchInput,
  ListBranchesQuery,
  SetBranchStatusInput,
  UpdateBranchInput,
} from "@/validations/branchSchema";

export async function createBranch(input: CreateBranchInput) {
  await connectDB();
  return BranchModel.create(input);
}

// §7.4: "List accessible branches" — HOST sees every branch, AGENT only its own.
//
// Both roles go through the same paginated path so the envelope is identical
// either way: an AGENT's one-row result still reports total/totalPages rather
// than a bare array the client has to special-case.
export async function listBranches(
  user: SessionUser,
  query: ListBranchesQuery,
) {
  await connectDB();

  // An AGENT with no assigned branch has nothing accessible — an empty page,
  // not a filter-less query that would expose every branch.
  if (user.role !== "HOST" && !user.branch) {
    return toPaginated([], query, 0);
  }

  const filter: Record<string, unknown> =
    user.role === "HOST" ? {} : { _id: user.branch };

  return paginateQueries(
    BranchModel.find(filter)
      .sort(stableSort({ name: 1 }))
      .skip(paginationSkip(query))
      .limit(query.limit),
    BranchModel.countDocuments(filter),
    query,
  );
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
