// @/app/api/v1/auth/login/route.ts
import type { NextRequest } from "next/server";
import {
  createSession,
  hashPassword,
  serializeSessionUser,
  setSessionCookie,
  toSessionUser,
  verifyPassword,
} from "@/lib/auth";
import {
  Errors,
  parseJsonBody,
  successResponse,
  withErrorHandling,
  zodErrorToAppError,
} from "@/lib/errors";
import { connectDB } from "@/lib/mongodb";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import BranchModel from "@/models/Branch";
import UserModel from "@/models/User";
import { loginSchema } from "@/validations/auth.schema";

const LOGIN_RATE_LIMIT = 10;
const LOGIN_RATE_WINDOW_MS = 15 * 60 * 1000;

// A precomputed hash to verify against when no user is found, so that
// response timing doesn't tell an attacker whether a username exists.
const DUMMY_PASSWORD = "grooma-timing-safety-placeholder";
let dummyHashPromise: Promise<string> | undefined;

function getDummyHash(): Promise<string> {
  if (!dummyHashPromise) {
    dummyHashPromise = hashPassword(DUMMY_PASSWORD);
  }
  return dummyHashPromise;
}

export const POST = withErrorHandling(async (request: NextRequest) => {
  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(
    `login:${ip}`,
    LOGIN_RATE_LIMIT,
    LOGIN_RATE_WINDOW_MS,
  );
  if (!rateLimit.allowed) {
    throw Errors.rateLimited();
  }

  const parsed = loginSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    throw zodErrorToAppError(parsed.error);
  }
  const { username, password } = parsed.data;

  await connectDB();

  // §6.1 order: find account -> verify account status -> verify password.
  const user = await UserModel.findOne({ username }).select("+password");

  if (!user) {
    await verifyPassword(await getDummyHash(), password);
    throw Errors.invalidCredentials();
  }

  if (user.status !== "ACTIVE") {
    throw Errors.accountInactive();
  }

  const passwordMatches = await verifyPassword(user.password, password);
  if (!passwordMatches) {
    throw Errors.invalidCredentials();
  }

  const { token, expiresAt } = await createSession(user._id);

  let branchName: string | null = null;
  if (user.branch) {
    const branch = await BranchModel.findById(user.branch)
      .select("name")
      .lean();
    branchName = branch?.name ?? null;
  }

  const response = successResponse({
    user: serializeSessionUser(toSessionUser(user), branchName),
  });
  setSessionCookie(response, token, expiresAt);
  return response;
});
