import { describe, expect, it } from "vitest";
import { requireBranchAccess, requireRole } from "@/lib/authorization";
import { AppError } from "@/lib/errors";
import { createMockBranchId, createMockSessionUser } from "./testUtils";

// These assertions originally matched the literal string "Access denied",
// which the implementation has never produced — the whole suite failed to
// load (missing SESSION_SECRET), so the mismatch stayed invisible. They now
// assert the stable contract instead: a 403 FORBIDDEN AppError. Asserting
// code+status rather than prose also stops a copy-edit to the message from
// breaking authorization tests.
function expectForbidden(fn: () => void): void {
  expect(fn).toThrow(AppError);
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe("FORBIDDEN");
    expect((error as AppError).status).toBe(403);
  }
}

describe("Authorization", () => {
  describe("requireRole", () => {
    it("should allow HOST user to access HOST-only routes", () => {
      const user = createMockSessionUser({ role: "HOST" });
      expect(() => requireRole(user, ["HOST"])).not.toThrow();
    });

    it("should allow AGENT user to access AGENT routes", () => {
      const user = createMockSessionUser({
        role: "AGENT",
        branch: createMockBranchId(),
      });
      expect(() => requireRole(user, ["AGENT"])).not.toThrow();
    });

    it("should allow multi-role access if user matches any role", () => {
      const user = createMockSessionUser({
        role: "AGENT",
        branch: createMockBranchId(),
      });
      expect(() => requireRole(user, ["HOST", "AGENT"])).not.toThrow();
    });

    it("should throw forbidden error if user role not in allowed list", () => {
      const user = createMockSessionUser({
        role: "AGENT",
        branch: createMockBranchId(),
      });
      expectForbidden(() => requireRole(user, ["HOST"]));
    });

    it("should throw forbidden error if GROOMA_ADMIN tries to access regular routes", () => {
      const user = createMockSessionUser({
        role: "GROOMA_ADMIN",
        branch: null,
      });
      expectForbidden(() => requireRole(user, ["HOST", "AGENT"]));
    });

    it("should handle empty allowed roles array", () => {
      const user = createMockSessionUser({ role: "HOST" });
      expectForbidden(() => requireRole(user, []));
    });
  });

  describe("requireBranchAccess", () => {
    it("should allow HOST to access any branch", () => {
      const user = createMockSessionUser({ role: "HOST", branch: null });
      const targetBranchId = createMockBranchId();
      expect(() => requireBranchAccess(user, targetBranchId)).not.toThrow();
    });

    it("should allow AGENT to access their own branch", () => {
      const branchId = createMockBranchId();
      const user = createMockSessionUser({ role: "AGENT", branch: branchId });
      expect(() => requireBranchAccess(user, branchId)).not.toThrow();
    });

    it("should throw forbidden error if AGENT tries to access different branch", () => {
      const userBranchId = createMockBranchId();
      const targetBranchId = createMockBranchId();
      const user = createMockSessionUser({
        role: "AGENT",
        branch: userBranchId,
      });
      expectForbidden(() => requireBranchAccess(user, targetBranchId));
    });

    it("should throw error if AGENT branch is null", () => {
      const user = createMockSessionUser({ role: "AGENT", branch: null });
      const targetBranchId = createMockBranchId();
      expect(() => requireBranchAccess(user, targetBranchId)).toThrow();
    });

    it("should handle undefined branch access (defaults to no branch)", () => {
      const user = createMockSessionUser({ role: "HOST" });
      const targetBranchId = createMockBranchId();
      expect(() => requireBranchAccess(user, targetBranchId)).not.toThrow();
    });

    it("should throw forbidden error for GROOMA_ADMIN on any branch", () => {
      const user = createMockSessionUser({
        role: "GROOMA_ADMIN",
        branch: null,
      });
      expectForbidden(() => requireBranchAccess(user, createMockBranchId()));
    });
  });

  // Regression: H-2. The six dashboard routes used to run on requireAuth
  // alone. dashboardService derives its branch filter as
  // `role === "HOST" ? query.branchId : user.branch || undefined`, so for
  // GROOMA_ADMIN (branch null, role neither HOST nor AGENT) it collapsed to
  // undefined — i.e. no filter — and returned business-wide revenue,
  // transaction stats, agent performance and inventory. PRD §3.1/§3.2
  // forbid that role any operational data.
  describe("dashboard access policy (H-2 regression)", () => {
    const DASHBOARD_ROLES: Parameters<typeof requireRole>[1] = [
      "HOST",
      "AGENT",
    ];

    it("rejects GROOMA_ADMIN", () => {
      const admin = createMockSessionUser({
        role: "GROOMA_ADMIN",
        branch: null,
      });
      expectForbidden(() => requireRole(admin, DASHBOARD_ROLES));
    });

    it("still admits HOST and AGENT", () => {
      const host = createMockSessionUser({ role: "HOST", branch: null });
      const agent = createMockSessionUser({
        role: "AGENT",
        branch: createMockBranchId(),
      });
      expect(() => requireRole(host, DASHBOARD_ROLES)).not.toThrow();
      expect(() => requireRole(agent, DASHBOARD_ROLES)).not.toThrow();
    });
  });
});
