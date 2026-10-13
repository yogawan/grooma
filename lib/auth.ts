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
  role: "HOST" | "AGENT" | "GROOMA_ADMIN";
  branch: string | null;
  status: "ACTIVE" | "INACTIVE";
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

  if (!user || user.status !== "ACTIVE") {
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

export function setSessionCookie(
  response: NextResponse,
  token: string,
  expiresAt: Date,
): void {
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
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
