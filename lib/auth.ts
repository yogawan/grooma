// @/lib/auth.ts
import { createHmac, randomBytes } from "node:crypto";
import { hash as argon2Hash, argon2id, verify as argon2Verify } from "argon2";
import type { Types } from "mongoose";
import type { NextRequest, NextResponse } from "next/server";
import SessionModel from "@/models/Session";
import UserModel from "@/models/User";
import { connectDB } from "./mongodb";

const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  throw new Error("Missing SESSION_SECRET environment variable.");
}

export const SESSION_COOKIE_NAME = "grooma_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface SessionUser {
  id: string;
  username: string;
  name: string;
  role: "HOST" | "AGENT";
  branch: string | null;
  status: "ACTIVE" | "INACTIVE";
}

// This service serves exactly two roles. Platform administration lives in a
// separate admin backend that shares this database, so rows for roles this
// service does not know about (GROOMA_ADMIN) really do exist in the `users`
// collection — the boundary is that they can never hold a session here.
//
// Enforced at both entry points: login (app/api/v1/auth/login/route.ts) and
// every subsequent request (getSessionUser below). The second check is what
// matters for a session minted before a role was reassigned, or by a build
// that predates this boundary.
export const SERVICE_ROLES = ["HOST", "AGENT"] as const;

export function isServiceRole(role: string): role is SessionUser["role"] {
  return (SERVICE_ROLES as readonly string[]).includes(role);
}

// Matches both a hydrated Mongoose document and a `.lean()` plain object —
// the two shapes toSessionUser() gets fed from login (hydrated, for .save()
// later) and session validation (lean, read-only).
interface UserLike {
  _id: { toString(): string };
  username: string;
  name: string;
  role: SessionUser["role"];
  branch?: { toString(): string } | null;
  status: SessionUser["status"];
}

export async function hashPassword(plain: string): Promise<string> {
  return argon2Hash(plain, { type: argon2id });
}

export async function verifyPassword(
  hash: string,
  plain: string,
): Promise<boolean> {
  return argon2Verify(hash, plain);
}

function hashToken(token: string): string {
  return createHmac("sha256", SESSION_SECRET as string)
    .update(token)
    .digest("hex");
}

export function toSessionUser(user: UserLike): SessionUser {
  return {
    id: user._id.toString(),
    username: user.username,
    name: user.name,
    role: user.role,
    branch: user.branch ? user.branch.toString() : null,
    status: user.status,
  };
}

export async function createSession(
  userId: Types.ObjectId | string,
): Promise<{ token: string; expiresAt: Date }> {
  await connectDB();

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await SessionModel.create({
    user: userId,
    tokenHash: hashToken(token),
    expiresAt,
  });

  return { token, expiresAt };
}

export async function getSessionUser(
  token: string | undefined,
): Promise<SessionUser | null> {
  if (!token) {
    return null;
  }

  await connectDB();

  const session = await SessionModel.findOne({
    tokenHash: hashToken(token),
    expiresAt: { $gt: new Date() },
  }).lean();

  if (!session) {
    return null;
  }

  const user = await UserModel.findById(session.user).lean();

  if (!user || user.status !== "ACTIVE" || !isServiceRole(user.role)) {
    return null;
  }

  return toSessionUser(user);
}

export async function getCurrentUser(
  request: NextRequest,
): Promise<SessionUser | null> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  return getSessionUser(token);
}

export async function revokeSession(token: string | undefined): Promise<void> {
  if (!token) {
    return;
  }

  await connectDB();
  await SessionModel.deleteOne({ tokenHash: hashToken(token) });
}

// §15: a password change must not leave an attacker's stolen session alive —
// that is the whole point of changing it. Every other session for the
// account is dropped; the caller's own session survives so a routine
// rotation doesn't log the user out of the device they are holding.
//
// Passing no `keepToken` revokes every session for the user, which is what
// an admin-initiated reset would want.
export async function revokeOtherSessions(
  userId: Types.ObjectId | string,
  keepToken?: string,
): Promise<number> {
  await connectDB();

  const filter: Record<string, unknown> = { user: userId };
  if (keepToken) {
    filter.tokenHash = { $ne: hashToken(keepToken) };
  }

  const result = await SessionModel.deleteMany(filter);
  return result.deletedCount ?? 0;
}

export function setSessionCookie(
  response: NextResponse,
  token: string,
  expiresAt: Date,
): void {
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.APPLICATION_ENVIRONMENT === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.delete(SESSION_COOKIE_NAME);
}

export function serializeSessionUser(
  user: SessionUser,
  branchName: string | null = null,
) {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    branch: user.branch ? { id: user.branch, name: branchName } : null,
  };
}
