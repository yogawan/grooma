// @/lib/authorization.ts
import type { NextRequest } from "next/server";
import { getCurrentUser, type SessionUser } from "./auth";
import { Errors } from "./errors";

// §23.4/§23.4.1 — three distinct levels, not a boolean. The earlier
// boolean couldn't express the middle case, which is the whole point of
// §23.4.1: an endpoint that stays open to AGENT while still being closed to
// a lapsed HOST.
//
//   ENFORCED      default. Both roles refused while the subscription is
//                 lapsed. Anything new is this until someone opts out, so a
//                 freshly written endpoint is gated by omission.
//   EXEMPT_ALL    reachable by both roles even while lapsed — /subscription*
//                 (so the HOST can actually pay), /profile, and the auth
//                 endpoints a blocked HOST still needs to identify itself,
//                 rotate its password, or sign out.
//   EXEMPT_AGENT  AGENT proceeds, HOST is still refused. The POS flow
//                 (§23.4.1): a customer already in the chair must not be
//                 held hostage by the owner's unpaid invoice, but the owner
//                 gets no relief from it either.
export type SubscriptionAccessPolicy =
  | "ENFORCED"
  | "EXEMPT_ALL"
  | "EXEMPT_AGENT";

export interface RequireAuthOptions {
  subscriptionPolicy?: SubscriptionAccessPolicy;
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

  await requireActiveSubscription(user, options.subscriptionPolicy);

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
//
// §23.4.1 changed the shape of this function: there is deliberately NO
// `user.role !== "HOST"` early return any more. That blanket skip meant an
// AGENT kept unrestricted access to everything — inventory, dashboard, the
// lot — for as long as a HOST never paid, which left no pressure to pay at
// all. AGENT is now gated per-endpoint exactly like HOST; the difference is
// only which endpoints each role is exempt on.
export function assertSubscriptionAllowsAccess(
  user: SessionUser,
  subscriptionStatus: string | null,
  policy: SubscriptionAccessPolicy = "ENFORCED",
): void {
  if (policy === "EXEMPT_ALL") {
    return;
  }

  if (subscriptionStatus === null) {
    return;
  }

  if (!BLOCKING_SUBSCRIPTION_STATUSES.has(subscriptionStatus)) {
    return;
  }

  // Lapsed from here down. The POS flow stays open to AGENT only — a HOST
  // hitting the very same endpoint is still refused (§23.4.1).
  if (policy === "EXEMPT_AGENT" && user.role === "AGENT") {
    return;
  }

  throw Errors.paymentRequired();
}

// §23.4 enforcement with the status read from the database. Throws a 402
// AppError — this previously threw a bare `new Error("PAYMENT_REQUIRED")`,
// which handleApiError has no case for, so it would have surfaced as a 500.
export async function requireActiveSubscription(
  user: SessionUser,
  policy: SubscriptionAccessPolicy = "ENFORCED",
): Promise<void> {
  if (policy === "EXEMPT_ALL") {
    return;
  }

  // An AGENT on an EXEMPT_AGENT endpoint proceeds whatever the status is, so
  // don't pay for the lookup at all. This deliberately keeps the POS hot
  // path query-free: the only endpoints where an AGENT now costs an extra
  // read are the ENFORCED ones (inventory, dashboard, branches), which are
  // not what a cashier hits per sale.
  if (policy === "EXEMPT_AGENT" && user.role === "AGENT") {
    return;
  }

  const { getDeploymentSubscriptionStatus, getHostSubscriptionStatus } =
    await import("@/services/subscriptionService");

  // A HOST is looked up by its own id — correct even in the §3.5 multi-HOST
  // edge case. An AGENT has no route to its HOST in the data model at all,
  // so it falls back to the deployment's single Subscription; see
  // getDeploymentSubscriptionStatus for why that is sound here.
  const status =
    user.role === "HOST"
      ? await getHostSubscriptionStatus(user.id)
      : await getDeploymentSubscriptionStatus();

  assertSubscriptionAllowsAccess(user, status, policy);
}
