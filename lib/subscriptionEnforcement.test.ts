// @/lib/subscriptionEnforcement.test.ts
//
// Originally regression tests for H-3: requireActiveSubscription() existed
// but was never called from anywhere, so PRD §23.4 — a HOST with a lapsed
// subscription may reach only /subscription* and /profile — was entirely
// unenforced, and it threw a bare Error that would have surfaced as a 500
// instead of the 402 the PRD specifies.
//
// REWRITTEN for §23.4.1. The AGENT cases here used to assert the opposite of
// what they now assert: that an AGENT is never blocked, on any endpoint, for
// any subscription status. That rule was deliberately abandoned — it left an
// AGENT with unrestricted access to everything (inventory, dashboard, the
// lot) for as long as a HOST never paid, so nothing ever pressured the HOST
// to pay. The replacement gates AGENT per-endpoint too; only the exempt set
// differs between the roles.

import { describe, expect, it } from "vitest";
import {
  assertSubscriptionAllowsAccess,
  type SubscriptionAccessPolicy,
} from "@/lib/authorization";
import { AppError } from "@/lib/errors";
import { createMockBranchId, createMockSessionUser } from "./testUtils";

const BLOCKING = ["PAST_DUE", "EXPIRED", "CANCELLED"];
const PASSING = ["ACTIVE"];

const host = createMockSessionUser({ role: "HOST", branch: null });
const agent = createMockSessionUser({
  role: "AGENT",
  branch: createMockBranchId(),
});

function expectPaymentRequired(fn: () => void): void {
  expect(fn).toThrow(AppError);
  try {
    fn();
  } catch (error) {
    expect((error as AppError).code).toBe("PAYMENT_REQUIRED");
    // §23.4 asks for 402 specifically, on top of the §14 status table.
    expect((error as AppError).status).toBe(402);
  }
}

describe("assertSubscriptionAllowsAccess — ENFORCED (the default)", () => {
  it("defaults to ENFORCED when no policy is passed at all", () => {
    // The load-bearing property: a newly written endpoint that forgets to
    // pass a policy is gated, not accidentally wide open.
    expectPaymentRequired(() =>
      assertSubscriptionAllowsAccess(host, "EXPIRED"),
    );
    expectPaymentRequired(() =>
      assertSubscriptionAllowsAccess(agent, "EXPIRED"),
    );
  });

  describe("HOST", () => {
    it.each(BLOCKING)("is refused with 402 when subscription is %s", (s) => {
      expectPaymentRequired(() =>
        assertSubscriptionAllowsAccess(host, s, "ENFORCED"),
      );
    });

    it.each(PASSING)("is allowed when subscription is %s", (s) => {
      expect(() =>
        assertSubscriptionAllowsAccess(host, s, "ENFORCED"),
      ).not.toThrow();
    });
  });

  describe("AGENT — §23.4.1: no longer exempt by virtue of its role", () => {
    it.each(BLOCKING)("is refused with 402 when subscription is %s", (s) => {
      expectPaymentRequired(() =>
        assertSubscriptionAllowsAccess(agent, s, "ENFORCED"),
      );
    });

    it.each(PASSING)("is allowed when subscription is %s", (s) => {
      expect(() =>
        assertSubscriptionAllowsAccess(agent, s, "ENFORCED"),
      ).not.toThrow();
    });
  });
});

describe("assertSubscriptionAllowsAccess — EXEMPT_AGENT (the POS flow)", () => {
  it.each(
    BLOCKING,
  )("lets an AGENT keep serving the customer in the chair when subscription is %s", (s) => {
    expect(() =>
      assertSubscriptionAllowsAccess(agent, s, "EXEMPT_AGENT"),
    ).not.toThrow();
  });

  it.each(
    BLOCKING,
  )("still refuses a HOST on the very same endpoint when subscription is %s", (s) => {
    // The whole reason this policy isn't just "exempt" — the owner gets no
    // relief from its own unpaid invoice, only the cashier does.
    expectPaymentRequired(() =>
      assertSubscriptionAllowsAccess(host, s, "EXEMPT_AGENT"),
    );
  });

  it.each(PASSING)("is allowed for both roles when subscription is %s", (s) => {
    expect(() =>
      assertSubscriptionAllowsAccess(agent, s, "EXEMPT_AGENT"),
    ).not.toThrow();
    expect(() =>
      assertSubscriptionAllowsAccess(host, s, "EXEMPT_AGENT"),
    ).not.toThrow();
  });
});

describe("assertSubscriptionAllowsAccess — EXEMPT_ALL", () => {
  it.each(
    BLOCKING,
  )("lets a lapsed HOST through so it can actually pay (subscription %s)", (s) => {
    expect(() =>
      assertSubscriptionAllowsAccess(host, s, "EXEMPT_ALL"),
    ).not.toThrow();
  });

  it.each(BLOCKING)("lets an AGENT through too (subscription %s)", (s) => {
    expect(() =>
      assertSubscriptionAllowsAccess(agent, s, "EXEMPT_ALL"),
    ).not.toThrow();
  });
});

describe("assertSubscriptionAllowsAccess — status edge cases", () => {
  const policies: SubscriptionAccessPolicy[] = [
    "ENFORCED",
    "EXEMPT_ALL",
    "EXEMPT_AGENT",
  ];

  // A freshly provisioned deployment seeds its HOST before any billing cycle
  // has run, so "no record yet" must not brick it before the first invoice
  // exists (docs/PROVISIONING-HOST.md). Must hold for every policy and both
  // roles — an AGENT newly gated by §23.4.1 must not be locked out of a
  // brand-new deployment either.
  it.each(policies)("allows a null status under policy %s", (policy) => {
    expect(() =>
      assertSubscriptionAllowsAccess(host, null, policy),
    ).not.toThrow();
    expect(() =>
      assertSubscriptionAllowsAccess(agent, null, policy),
    ).not.toThrow();
  });

  it.each(
    policies,
  )("treats an unrecognized status as non-blocking under policy %s", (policy) => {
    // Only explicitly non-paying states revoke access; an unknown value is
    // more likely a new status than a reason to deny a paying customer.
    expect(() =>
      assertSubscriptionAllowsAccess(host, "SOME_FUTURE_STATUS", policy),
    ).not.toThrow();
    expect(() =>
      assertSubscriptionAllowsAccess(agent, "SOME_FUTURE_STATUS", policy),
    ).not.toThrow();
  });
});
