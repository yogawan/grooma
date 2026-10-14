// @/lib/subscriptionEnforcement.test.ts
//
// Regression tests for H-3. requireActiveSubscription() existed but was
// never called from anywhere, so PRD §23.4 — a HOST with a lapsed
// subscription may reach only /subscription* and /profile — was entirely
// unenforced. It also threw a bare `new Error("PAYMENT_REQUIRED")`, which
// handleApiError has no branch for, so wiring it as-written would have
// produced a 500 instead of the 402 the PRD specifies.

import { describe, expect, it } from "vitest";
import { assertSubscriptionAllowsAccess } from "@/lib/authorization";
import { AppError } from "@/lib/errors";
import { createMockBranchId, createMockSessionUser } from "./testUtils";

const BLOCKING = ["PAST_DUE", "EXPIRED", "CANCELLED"];
const PASSING = ["ACTIVE"];

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

describe("assertSubscriptionAllowsAccess", () => {
  describe("HOST", () => {
    const host = createMockSessionUser({ role: "HOST", branch: null });

    it.each(BLOCKING)("is refused with 402 when subscription is %s", (s) => {
      expectPaymentRequired(() => assertSubscriptionAllowsAccess(host, s));
    });

    it.each(PASSING)("is allowed when subscription is %s", (s) => {
      expect(() => assertSubscriptionAllowsAccess(host, s)).not.toThrow();
    });

    // A freshly provisioned deployment seeds its HOST before any billing
    // cycle has run, so "no record yet" must not brick it before the first
    // invoice exists (docs/PROVISIONING-HOST.md).
    it("is allowed when no subscription record exists yet", () => {
      expect(() => assertSubscriptionAllowsAccess(host, null)).not.toThrow();
    });
  });

  describe("AGENT", () => {
    const agent = createMockSessionUser({
      role: "AGENT",
      branch: createMockBranchId(),
    });

    // §23.4 is explicit: a lapsed HOST subscription must never stop a branch
    // from trading.
    it.each([
      ...BLOCKING,
      ...PASSING,
    ])("keeps trading when the HOST subscription is %s", (s) => {
      expect(() => assertSubscriptionAllowsAccess(agent, s)).not.toThrow();
    });

    it("keeps trading when there is no subscription record", () => {
      expect(() => assertSubscriptionAllowsAccess(agent, null)).not.toThrow();
    });
  });

  // A GROOMA_ADMIN block used to sit here, asserting that role carried no
  // subscription requirement. It moved to the admin backend; the behaviour it
  // covered is the `role !== "HOST"` early return, which the AGENT cases above
  // already exercise.

  it("treats an unrecognized status as non-blocking rather than locking out", () => {
    const host = createMockSessionUser({ role: "HOST", branch: null });
    // Only explicitly non-paying states revoke access; an unknown value is
    // more likely a new status than a reason to deny a paying customer.
    expect(() =>
      assertSubscriptionAllowsAccess(host, "SOME_FUTURE_STATUS"),
    ).not.toThrow();
  });
});
