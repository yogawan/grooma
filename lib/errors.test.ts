import type mongoose from "mongoose";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  AppError,
  duplicateKeyErrorToAppError,
  Errors,
  mongooseValidationErrorToAppError,
  zodErrorToAppError,
} from "@/lib/errors";

interface ValidDuplicateKeyError {
  code: 11000;
  keyValue?: Record<string, unknown>;
}

interface MockErrorObject {
  code: number;
  keyValue?: Record<string, unknown>;
}

describe("Errors", () => {
  describe("AppError", () => {
    it("should create an AppError with correct properties", () => {
      const error = new AppError("TEST_CODE", "Test message", 400);
      expect(error.code).toBe("TEST_CODE");
      expect(error.status).toBe(400);
      expect(error.message).toBe("Test message");
    });

    it("should be instanceof Error", () => {
      const error = new AppError("TEST", "message", 400);
      expect(error instanceof Error).toBe(true);
    });
  });

  describe("Errors factory", () => {
    it("should create unauthenticated error", () => {
      const error = Errors.unauthenticated();
      expect(error.code).toBe("UNAUTHENTICATED");
      expect(error.status).toBe(401);
    });

    it("should create invalidCredentials error", () => {
      const error = Errors.invalidCredentials();
      expect(error.code).toBe("INVALID_CREDENTIALS");
      expect(error.status).toBe(401);
    });

    it("should create forbidden error", () => {
      const error = Errors.forbidden();
      expect(error.code).toBe("FORBIDDEN");
      expect(error.status).toBe(403);
    });

    it("should create validation error with message", () => {
      const error = Errors.validation("Username is required");
      expect(error.code).toBe("VALIDATION_ERROR");
      expect(error.status).toBe(400);
      expect(error.message).toContain("Username is required");
    });

    it("should create notFound error", () => {
      const error = Errors.notFound("User");
      expect(error.code).toBe("NOT_FOUND");
      expect(error.status).toBe(404);
      expect(error.message).toContain("User");
    });

    it("should create conflict error", () => {
      const error = Errors.conflict("Username already exists");
      expect(error.code).toBe("CONFLICT");
      expect(error.status).toBe(409);
    });

    // PRD §14 maps 422 to "Business validation failure" and reserves 400 for
    // "Invalid input"; the error-code vocabulary is not specified there, and
    // BUSINESS_RULE_VIOLATION has been the emitted code since lib/errors.ts
    // was first written (ca5c3bb). This assertion previously expected
    // BUSINESS_RULE/400, which never matched any implementation — it stayed
    // invisible only because the suite's failure was accepted as baseline.
    it("should create businessRule error", () => {
      const error = Errors.businessRule("Cannot cancel completed transaction");
      expect(error.code).toBe("BUSINESS_RULE_VIOLATION");
      expect(error.status).toBe(422);
      expect(error.message).toBe("Cannot cancel completed transaction");
    });

    it("should create rateLimited error", () => {
      const error = Errors.rateLimited(
        "Too many requests. Retry after 5 minutes.",
      );
      expect(error.code).toBe("RATE_LIMITED");
      expect(error.status).toBe(429);
      expect(error.message).toContain("Too many requests");
    });
  });

  describe("zodErrorToAppError", () => {
    it("should convert single field validation error", () => {
      const schema = z.object({ username: z.string().min(3) });
      const result = schema.safeParse({ username: "ab" });

      if (!result.success) {
        const error = zodErrorToAppError(result.error);
        expect(error.code).toBe("VALIDATION_ERROR");
        expect(error.status).toBe(400);
        expect(error.message).toContain("username");
      }
    });

    it("should convert multiple field validation errors", () => {
      const schema = z.object({
        username: z.string().min(3),
        password: z.string().min(8),
      });
      const result = schema.safeParse({ username: "ab", password: "short" });

      if (!result.success) {
        const error = zodErrorToAppError(result.error);
        expect(error.code).toBe("VALIDATION_ERROR");
        expect(error.message).toContain("username");
        expect(error.message).toContain("password");
      }
    });

    it("should handle nested field validation errors", () => {
      const schema = z.object({
        user: z.object({ name: z.string().min(1) }),
      });
      const result = schema.safeParse({ user: { name: "" } });

      if (!result.success) {
        const error = zodErrorToAppError(result.error);
        expect(error.code).toBe("VALIDATION_ERROR");
      }
    });
  });

  describe("mongooseValidationErrorToAppError", () => {
    it("should convert mongoose validation error", () => {
      const validationError = {
        errors: {
          username: { message: "Username is required" },
          email: { message: "Email is invalid" },
        },
      };

      const error = mongooseValidationErrorToAppError(
        validationError as unknown as mongoose.Error.ValidationError,
      );
      expect(error.code).toBe("VALIDATION_ERROR");
      expect(error.status).toBe(400);
      expect(error.message).toContain("username");
      expect(error.message).toContain("email");
    });

    it("should handle empty validation errors", () => {
      const validationError = { errors: {} };
      const error = mongooseValidationErrorToAppError(
        validationError as unknown as mongoose.Error.ValidationError,
      );
      expect(error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("duplicateKeyErrorToAppError", () => {
    it("should convert duplicate key error", () => {
      const mongoError = {
        code: 11000,
        keyValue: { username: "testuser" },
      } as ValidDuplicateKeyError;

      const error = duplicateKeyErrorToAppError(mongoError);
      expect(error).not.toBeNull();
      if (error) {
        expect(error.code).toBe("CONFLICT");
        expect(error.status).toBe(409);
        expect(error.message).toContain("username");
      }
    });

    it("should handle multiple duplicate keys", () => {
      const mongoError = {
        code: 11000,
        keyValue: { username: "test", email: "test@example.com" },
      } as ValidDuplicateKeyError;

      const error = duplicateKeyErrorToAppError(mongoError);
      expect(error).not.toBeNull();
      if (error) {
        expect(error.code).toBe("CONFLICT");
      }
    });

    it("should not match non-11000 errors", () => {
      const mongoError = {
        code: 12345,
        keyValue: {},
      } as MockErrorObject;
      const error = duplicateKeyErrorToAppError(
        mongoError as unknown as ValidDuplicateKeyError,
      );
      expect(error).toBeNull();
    });
  });
});
