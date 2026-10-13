// @/lib/authorization.ts
import type { NextRequest } from "next/server";
import { getCurrentUser, type SessionUser } from "./auth";
import { Errors } from "./errors";

// §6.3 order: 1. session validation, 2. user status validation — both are
// covered by getCurrentUser(), which returns null for missing/expired
// sessions and for sessions whose user is no longer ACTIVE.
export async function requireAuth(request: NextRequest): Promise<SessionUser> {
  const user = await getCurrentUser(request);

  if (!user) {
    throw Errors.unauthenticated();
  }

  return user;
}

export function requireRole(
  user: SessionUser,
  allowedRoles: SessionUser["role"][],
): void {
  if (!allowedRoles.includes(user.role)) {
    throw Errors.forbidden();
  }
}

// HOST reaches every branch; AGENT only its own. `branchId` is whatever the
// request body/query claims — it is never trusted on its own, only compared
// against the branch recorded on the authenticated session (§3.3).
export function requireBranchAccess(user: SessionUser, branchId: string): void {
  if (user.role === "HOST") {
    return;
  }

  if (!user.branch || user.branch !== branchId) {
    throw Errors.forbidden();
  }
}
