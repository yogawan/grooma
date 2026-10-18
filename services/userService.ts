// @/services/userService.ts
import type { SessionUser } from "@/lib/auth";
import { hashPassword, SERVICE_ROLES } from "@/lib/auth";
import { Errors } from "@/lib/errors";
import { connectDB } from "@/lib/mongodb";
import { paginateQueries, paginationSkip, stableSort } from "@/lib/pagination";
import BranchModel from "@/models/Branch";
import UserModel from "@/models/User";
import type {
  CreateUserInput,
  ListUsersQuery,
  SetUserStatusInput,
  UpdateProfileInput,
  UpdateUserInput,
} from "@/validations/userSchema";

// The staff namespace is scoped to the roles this service owns, so a
// platform-internal account 404s here exactly like it doesn't exist
// (§3.4, §23.1).
//
// This matters more than it looks: the admin backend shares this database and
// is what creates GROOMA_ADMIN rows, so they are genuinely present in the
// `users` collection and would otherwise show up in a HOST's staff list.
//
// Deliberately a positive allowlist rather than the `$ne: "GROOMA_ADMIN"` it
// replaced — role creation now lives in another codebase, and an exclusion
// list silently starts leaking the moment that codebase adds a role nobody
// remembered to add here. Unknown roles are excluded by default.
const SERVICE_ROLE_FILTER = { role: { $in: [...SERVICE_ROLES] } };

interface PopulatedBranch {
  _id: { toString(): string };
  name: string;
}

interface SerializableUser {
  _id: { toString(): string };
  username: string;
  name: string;
  role: string;
  branch?: PopulatedBranch | null;
  phone?: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

// Password hash is never selected by default (schema: select:false), so it
// cannot leak through here. The cast reflects that every call site below has
// already run .populate("branch", "name"), which the installed Mongoose
// version's types don't thread through query chains precisely enough to infer
// on their own.
function serializeUser(user: unknown) {
  const u = user as SerializableUser;
  const branch = u.branch ?? null;

  return {
    id: u._id.toString(),
    username: u.username,
    name: u.name,
    role: u.role,
    branch: branch ? { id: branch._id.toString(), name: branch.name } : null,
    phone: u.phone ?? null,
    status: u.status,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

async function assertBranchExists(branchId: string): Promise<void> {
  const exists = await BranchModel.exists({ _id: branchId });
  if (!exists) {
    throw Errors.validation("Branch does not exist.");
  }
}

export async function createUser(input: CreateUserInput) {
  await connectDB();

  if (input.branch) {
    await assertBranchExists(input.branch);
  }

  const passwordHash = await hashPassword(input.password);

  const user = await UserModel.create({
    username: input.username,
    password: passwordHash,
    name: input.name,
    role: input.role,
    // `||` not `??`: branch is typed string | null | undefined, and an empty
    // string is a valid Zod value here — `??` only catches null/undefined,
    // so "" would reach Mongoose's ObjectId cast as-is and crash with a 500
    // instead of clearing branch the way null does.
    branch: input.branch || null,
    phone: input.phone,
  });

  await user.populate("branch", "name");
  return serializeUser(user);
}

export async function listUsers(query: ListUsersQuery) {
  await connectDB();

  // SERVICE_ROLE_FILTER is applied to the count as well, so `total` cannot
  // leak the existence of platform-internal accounts by being larger than
  // the rows this namespace is willing to return.
  const { items, pagination } = await paginateQueries(
    UserModel.find(SERVICE_ROLE_FILTER)
      .sort(stableSort({ createdAt: -1 }))
      .skip(paginationSkip(query))
      .limit(query.limit)
      .populate("branch", "name"),
    UserModel.countDocuments(SERVICE_ROLE_FILTER),
    query,
  );

  return { items: items.map(serializeUser), pagination };
}

export async function getUserById(id: string) {
  await connectDB();
  const user = await UserModel.findOne({
    _id: id,
    ...SERVICE_ROLE_FILTER,
  }).populate("branch", "name");

  if (!user) {
    throw Errors.notFound("User not found.");
  }

  return serializeUser(user);
}

export async function updateUser(id: string, input: UpdateUserInput) {
  await connectDB();
  const user = await UserModel.findOne({ _id: id, ...SERVICE_ROLE_FILTER });

  if (!user) {
    throw Errors.notFound("User not found.");
  }

  if (input.name !== undefined) user.name = input.name;
  if (input.role !== undefined) user.role = input.role;
  if (input.phone !== undefined) user.phone = input.phone;

  if ("branch" in input) {
    if (input.branch) {
      await assertBranchExists(input.branch);
    }
    // `||` not `??` — see the matching comment in createUser. An empty
    // string must clear branch (HOST's branch must be null) exactly like
    // null does, not get cast to ObjectId and crash.
    user.branch = input.branch || null;
  }

  await user.save();
  await user.populate("branch", "name");
  return serializeUser(user);
}

export async function setUserStatus(id: string, input: SetUserStatusInput) {
  await connectDB();
  const user = await UserModel.findOne({ _id: id, ...SERVICE_ROLE_FILTER });

  if (!user) {
    throw Errors.notFound("User not found.");
  }

  user.status = input.status;
  await user.save();
  await user.populate("branch", "name");

  return serializeUser(user);
}

export async function getOwnProfile(sessionUser: SessionUser) {
  await connectDB();
  const user = await UserModel.findById(sessionUser.id).populate(
    "branch",
    "name",
  );

  if (!user) {
    throw Errors.unauthenticated();
  }

  return serializeUser(user);
}

export async function updateOwnProfile(
  sessionUser: SessionUser,
  input: UpdateProfileInput,
) {
  await connectDB();
  const user = await UserModel.findById(sessionUser.id);

  if (!user) {
    throw Errors.unauthenticated();
  }

  if (input.name !== undefined) user.name = input.name;
  if (input.phone !== undefined) user.phone = input.phone;

  await user.save();
  await user.populate("branch", "name");
  return serializeUser(user);
}
