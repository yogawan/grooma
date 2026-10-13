// @/services/user.service.ts
import type { SessionUser } from "@/lib/auth";
import { hashPassword } from "@/lib/auth";
import { Errors } from "@/lib/errors";
import { connectDB } from "@/lib/mongodb";
import BranchModel from "@/models/Branch";
import UserModel from "@/models/User";
import type {
  CreateUserInput,
  SetUserStatusInput,
  UpdateProfileInput,
  UpdateUserInput,
} from "@/validations/user.schema";

// GROOMA_ADMIN accounts are platform-internal and never visible or editable
// through the ordinary /users namespace (§3.4, §23.1) — every lookup here
// excludes that role, so such an account 404s exactly like it doesn't exist.
const EXCLUDE_ADMIN_FILTER = { role: { $ne: "GROOMA_ADMIN" } };

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
  address?: string | null;
  photoUrl?: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

// Password hash is never selected by default (schema: select:false), and
// `compensation` — sensitive payroll data not part of the PRD's documented
// User fields (§3.1) — is deliberately left out of this projection too.
// The cast reflects that every call site below has already run
// .populate("branch", "name"), which the installed Mongoose version's types
// don't thread through query chains precisely enough to infer on their own.
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
    address: u.address ?? null,
    photoUrl: u.photoUrl ?? null,
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
    branch: input.branch ?? null,
    phone: input.phone,
    address: input.address,
    photoUrl: input.photoUrl,
  });

  await user.populate("branch", "name");
  return serializeUser(user);
}

export async function listUsers() {
  await connectDB();
  const users = await UserModel.find(EXCLUDE_ADMIN_FILTER)
    .sort({ createdAt: -1 })
    .populate("branch", "name");

  return users.map(serializeUser);
}

export async function getUserById(id: string) {
  await connectDB();
  const user = await UserModel.findOne({
    _id: id,
    ...EXCLUDE_ADMIN_FILTER,
  }).populate("branch", "name");

  if (!user) {
    throw Errors.notFound("User not found.");
  }

  return serializeUser(user);
}

export async function updateUser(id: string, input: UpdateUserInput) {
  await connectDB();
  const user = await UserModel.findOne({ _id: id, ...EXCLUDE_ADMIN_FILTER });

  if (!user) {
    throw Errors.notFound("User not found.");
  }

  if (input.name !== undefined) user.name = input.name;
  if (input.role !== undefined) user.role = input.role;
  if (input.phone !== undefined) user.phone = input.phone;
  if (input.address !== undefined) user.address = input.address;
  if (input.photoUrl !== undefined) user.photoUrl = input.photoUrl;

  if ("branch" in input) {
    if (input.branch) {
      await assertBranchExists(input.branch);
    }
    user.branch = input.branch ?? null;
  }

  await user.save();
  await user.populate("branch", "name");
  return serializeUser(user);
}

export async function setUserStatus(id: string, input: SetUserStatusInput) {
  await connectDB();
  const user = await UserModel.findOne({ _id: id, ...EXCLUDE_ADMIN_FILTER });

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
  if (input.address !== undefined) user.address = input.address;
  if (input.photoUrl !== undefined) user.photoUrl = input.photoUrl;

  await user.save();
  await user.populate("branch", "name");
  return serializeUser(user);
}
