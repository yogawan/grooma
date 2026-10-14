import { describe, expect, it } from "vitest";
import { requireBranchAccess, requireRole } from "@/lib/authorization";
import { createMockBranchId, createMockSessionUser } from "./testUtils";

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
      expect(() => requireRole(user, ["HOST"])).toThrow("Access denied");
    });

    it("should throw forbidden error if GROOMA_ADMIN tries to access regular routes", () => {
      const user = createMockSessionUser({
        role: "GROOMA_ADMIN",
        branch: null,
      });
      expect(() => requireRole(user, ["HOST", "AGENT"])).toThrow(
        "Access denied",
      );
    });

    it("should handle empty allowed roles array", () => {
      const user = createMockSessionUser({ role: "HOST" });
      expect(() => requireRole(user, [])).toThrow("Access denied");
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
      expect(() => requireBranchAccess(user, targetBranchId)).toThrow(
        "Access denied",
      );
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
  });
});
