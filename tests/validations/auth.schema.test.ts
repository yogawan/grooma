import { describe, it, expect } from "vitest";
import { loginSchema, changePasswordSchema } from "@/validations/auth.schema";

describe("Auth Schemas", () => {
  describe("loginSchema", () => {
    const validPayload = {
      username: "testuser",
      password: "TestPassword123",
    };

    it("should validate correct login payload", () => {
      const result = loginSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    });

    it("should require username", () => {
      const { username, ...payload } = validPayload;
      const result = loginSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("should require password", () => {
      const { password, ...payload } = validPayload;
      const result = loginSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("should accept various username formats", () => {
      const usernames = ["user", "user123", "user_name", "user.name"];
      usernames.forEach((username) => {
        const result = loginSchema.safeParse({
          ...validPayload,
          username,
        });
        expect(result.success).toBe(true);
      });
    });

    it("should accept various password formats", () => {
      const passwords = [
        "SimplePassword1",
        "P@ssw0rd!",
        "VeryLongPasswordWithManyCharacters123456789",
      ];
      passwords.forEach((password) => {
        const result = loginSchema.safeParse({
          ...validPayload,
          password,
        });
        expect(result.success).toBe(true);
      });
    });

    it("should trim whitespace from username and password", () => {
      const result = loginSchema.safeParse({
        username: "  testuser  ",
        password: "  TestPassword123  ",
      });
      if (result.success) {
        expect(result.data.username).toBe("testuser");
        expect(result.data.password).toBe("TestPassword123");
      }
    });

    it("should reject unknown fields (strict mode)", () => {
      const payload = {
        ...validPayload,
        rememberMe: true,
      };
      const result = loginSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  describe("changePasswordSchema", () => {
    const validPayload = {
      currentPassword: "OldPassword123",
      newPassword: "NewPassword456",
    };

    it("should validate correct change password payload", () => {
      const result = changePasswordSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    });

    it("should require currentPassword", () => {
      const { currentPassword, ...payload } = validPayload;
      const result = changePasswordSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("should require newPassword", () => {
      const { newPassword, ...payload } = validPayload;
      const result = changePasswordSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("should enforce minimum password length of 8 characters", () => {
      const result = changePasswordSchema.safeParse({
        ...validPayload,
        newPassword: "Short1",
      });
      expect(result.success).toBe(false);
    });

    it("should allow 8-character passwords", () => {
      const result = changePasswordSchema.safeParse({
        ...validPayload,
        newPassword: "Exactly8",
      });
      expect(result.success).toBe(true);
    });

    it("should allow very long passwords", () => {
      const result = changePasswordSchema.safeParse({
        ...validPayload,
        newPassword:
          "VeryLongPasswordWithManyCharactersAndSpecialChars123456789!@#$%",
      });
      expect(result.success).toBe(true);
    });

    it("should allow same current and new password (validation at service level)", () => {
      const payload = {
        currentPassword: "SamePassword123",
        newPassword: "SamePassword123",
      };
      const result = changePasswordSchema.safeParse(payload);
      // Schema only checks length, service layer checks for difference
      expect(result.success).toBe(true);
    });

    it("should trim whitespace from passwords", () => {
      const result = changePasswordSchema.safeParse({
        currentPassword: "  OldPassword123  ",
        newPassword: "  NewPassword456  ",
      });
      if (result.success) {
        expect(result.data.currentPassword).toBe("OldPassword123");
        expect(result.data.newPassword).toBe("NewPassword456");
      }
    });

    it("should reject unknown fields (strict mode)", () => {
      const payload = {
        ...validPayload,
        confirmPassword: "NewPassword456",
      };
      const result = changePasswordSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("should accept special characters in passwords", () => {
      const result = changePasswordSchema.safeParse({
        currentPassword: "P@ssw0rd!#$%",
        newPassword: "NewP@ss!#$%123",
      });
      expect(result.success).toBe(true);
    });
  });
});
