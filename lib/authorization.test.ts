import { describe, expect, it } from "vitest";
import { isServiceRole, type SessionUser } from "@/lib/auth";
import { requireBranchAccess, requireRole } from "@/lib/authorization";
import { AppError } from "@/lib/errors";
import { createMockBranchId, createMockSessionUser } from "./testUtils";

// GROOMA_ADMIN moved to a separate admin backend that shares this database,
// so SessionUser["role"] no longer has a name for it — but the `users`
// collection still does, and that is the whole point of these cases. The cast
// reproduces what this service would actually load from a row the admin
// backend wrote; without it the scenario is simply unexpressible, which is
// not the same as impossible.
const FOREIGN_ROLE = "GROOMA_ADMIN" as unknown as SessionUser["role"];

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

    it("should throw forbidden error for a role this service does not own", () => {
      const user = createMockSessionUser({
        role: FOREIGN_ROLE,
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

    it("should throw forbidden error for a foreign role on any branch", () => {
      const user = createMockSessionUser({
        role: FOREIGN_ROLE,
        branch: null,
      });
      expectForbidden(() => requireBranchAccess(user, createMockBranchId()));
    });
  });

  // Regression: H-2. The six dashboard routes used to run on requireAuth
  // alone. dashboardService derives its branch filter as
  // `role === "HOST" ? query.branchId : user.branch || undefined`, so for a
  // branch-less role that is neither HOST nor AGENT it collapsed to
  // undefined — i.e. no filter — and returned business-wide revenue,
  // transaction stats, agent performance and inventory. PRD §3.1/§3.2 forbid
  // a platform role any operational data.
  //
  // The role that originally triggered this (GROOMA_ADMIN) now lives in a
  // separate backend, but the shape of the bug does not depend on which role
  // it was — any session whose role falls outside the allowed list must be
  // refused, so the case is still worth pinning.
  describe("dashboard access policy (H-2 regression)", () => {
    const DASHBOARD_ROLES: Parameters<typeof requireRole>[1] = [
      "HOST",
      "AGENT",
    ];

    it("rejects a role outside the dashboard's allowed list", () => {
      const foreign = createMockSessionUser({
        role: FOREIGN_ROLE,
        branch: null,
      });
      expectForbidden(() => requireRole(foreign, DASHBOARD_ROLES));
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

  // The role gates above only run once a session exists. isServiceRole is the
  // gate that decides whether a session is issued at all — it is what keeps an
  // admin row in the shared database from authenticating against this service
  // (lib/auth.ts, app/api/v1/auth/login/route.ts).
  describe("isServiceRole", () => {
    it("accepts the two roles this service owns", () => {
      expect(isServiceRole("HOST")).toBe(true);
      expect(isServiceRole("AGENT")).toBe(true);
    });

    it("rejects the admin backend's role", () => {
      expect(isServiceRole("GROOMA_ADMIN")).toBe(false);
    });

    it("rejects an unknown role rather than assuming it is harmless", () => {
      expect(isServiceRole("SUPPORT")).toBe(false);
      expect(isServiceRole("")).toBe(false);
    });

    it("is case-sensitive, so a lowercased role is not silently accepted", () => {
      expect(isServiceRole("host")).toBe(false);
    });
  });
});
