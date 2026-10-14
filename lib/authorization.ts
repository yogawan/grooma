// @/lib/authorization.ts
import type { NextRequest } from "next/server";
import { getCurrentUser, type SessionUser } from "./auth";
import { Errors } from "./errors";

export interface RequireAuthOptions {
  // Set on the handful of endpoints §23.4 keeps reachable while a
  // subscription is lapsed (/subscription*, /profile) plus the auth
  // endpoints, which a blocked HOST still needs in order to see who it is,
  // rotate its password, or sign out.
  subscriptionExempt?: boolean;
}

// §6.3 order: 1. session validation, 2. user status validation — both are
// covered by getCurrentUser(), which returns null for missing/expired
// sessions and for sessions whose user is no longer ACTIVE.
//
// Subscription enforcement (§23.4) is applied here, on by default, so a new
// endpoint is gated the moment it is written rather than whenever someone
// remembers to add a check. Routes that must stay open opt out explicitly.
export async function requireAuth(
  request: NextRequest,
  options: RequireAuthOptions = {},
): Promise<SessionUser> {
  const user = await getCurrentUser(request);

  if (!user) {
    throw Errors.unauthenticated();
  }

  if (!options.subscriptionExempt) {
    await requireActiveSubscription(user);
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

// §6.4: Only GROOMA_ADMIN role can access /api/v1/admin/* endpoints
export function requireAdmin(user: SessionUser): void {
  if (user.role !== "GROOMA_ADMIN") {
    throw Errors.forbidden("Only administrators can access this resource.");
  }
}

// Statuses that revoke access (§23.4 names PAST_DUE and EXPIRED; CANCELLED
// belongs with them — it is likewise not a paying state).
const BLOCKING_SUBSCRIPTION_STATUSES = new Set([
  "PAST_DUE",
  "EXPIRED",
  "CANCELLED",
]);

// Pure decision half, kept separate from the lookup so the policy matrix is
// testable without a database.
//
// A HOST with NO subscription record is deliberately allowed through: a
// freshly provisioned deployment seeds its HOST before any billing cycle has
// run (docs/PROVISIONING-HOST.md), and blocking on absence would brick the
// deployment before its first invoice exists. Only an explicitly non-paying
// status revokes access.
export function assertSubscriptionAllowsAccess(
  user: SessionUser,
  subscriptionStatus: string | null,
): void {
  // §23.4: AGENT is never blocked — a lapsed HOST subscription must not stop
  // a branch from trading. GROOMA_ADMIN has no subscription of its own.
  if (user.role !== "HOST") {
    return;
  }

  if (subscriptionStatus === null) {
    return;
  }

  if (BLOCKING_SUBSCRIPTION_STATUSES.has(subscriptionStatus)) {
    throw Errors.paymentRequired();
  }
}

// §23.4 enforcement with the status read from the database. Throws a 402
// AppError — this previously threw a bare `new Error("PAYMENT_REQUIRED")`,
// which handleApiError has no case for, so it would have surfaced as a 500.
// It was also never called from anywhere.
export async function requireActiveSubscription(
  user: SessionUser,
): Promise<void> {
  // Skip the query entirely for roles that can never be blocked.
  if (user.role !== "HOST") {
    return;
  }

  const { getHostSubscriptionStatus } = await import(
    "@/services/subscriptionService"
  );
  const status = await getHostSubscriptionStatus(user.id);

  assertSubscriptionAllowsAccess(user, status);
}
