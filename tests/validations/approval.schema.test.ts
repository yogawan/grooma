import { describe, it, expect } from "vitest";
import {
  submitChangeRequestSchema,
  approveChangeRequestSchema,
  rejectChangeRequestSchema,
  requestedChangesSchema,
} from "@/validations/approval.schema";

function mockObjectId(): string {
  return "507f1f77bcf86cd799439011";
}

describe("Approval Schemas", () => {
  describe("requestedChangesSchema", () => {
    it("should accept serviceId change", () => {
      const result = requestedChangesSchema.safeParse({
        serviceId: mockObjectId(),
      });
      expect(result.success).toBe(true);
    });

    it("should accept customerId change (nullable)", () => {
      const result = requestedChangesSchema.safeParse({
        customerId: mockObjectId(),
      });
      expect(result.success).toBe(true);
    });

    it("should accept null customerId", () => {
      const result = requestedChangesSchema.safeParse({
        customerId: null,
      });
      expect(result.success).toBe(true);
    });

    it("should accept discountAmount change", () => {
      const result = requestedChangesSchema.safeParse({
        discountAmount: 50000,
      });
      expect(result.success).toBe(true);
    });

    it("should accept serviceHourType change", () => {
      const result = requestedChangesSchema.safeParse({
        serviceHourType: "OVERTIME",
      });
      expect(result.success).toBe(true);
    });

    it("should allow multiple changes at once", () => {
      const result = requestedChangesSchema.safeParse({
        serviceId: mockObjectId(),
        discountAmount: 25000,
        serviceHourType: "OVERTIME",
      });
      expect(result.success).toBe(true);
    });

    it("should require at least one field to change", () => {
      const result = requestedChangesSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("should reject paymentMethod (immutable)", () => {
      const payload = {
        serviceId: mockObjectId(),
        paymentMethod: "QRIS",
      };
      const result = requestedChangesSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("should reject transactionStatus (immutable)", () => {
      const payload = {
        serviceId: mockObjectId(),
        transactionStatus: "COMPLETED",
      };
      const result = requestedChangesSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("should reject negative discount", () => {
      const result = requestedChangesSchema.safeParse({
        discountAmount: -100,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("submitChangeRequestSchema", () => {
    const validPayload = {
      reason: "Customer requested discount",
      requestedChanges: {
        discountAmount: 50000,
      },
    };

    it("should validate correct change request submission", () => {
      const result = submitChangeRequestSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    });

    it("should require reason", () => {
      const { reason, ...payload } = validPayload;
      const result = submitChangeRequestSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("should require requestedChanges", () => {
      const { requestedChanges, ...payload } = validPayload;
      const result = submitChangeRequestSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("should accept reason with reasonable length", () => {
      const result = submitChangeRequestSchema.safeParse({
        ...validPayload,
        reason: "A",
      });
      expect(result.success).toBe(true);
    });

    it("should allow very long reason", () => {
      const longReason = "A".repeat(1000);
      const result = submitChangeRequestSchema.safeParse({
        ...validPayload,
        reason: longReason,
      });
      expect(result.success).toBe(true);
    });

    it("should trim whitespace from reason", () => {
      const result = submitChangeRequestSchema.safeParse({
        ...validPayload,
        reason: "  Customer requested discount  ",
      });
      if (result.success) {
        expect(result.data.reason).toBe("Customer requested discount");
      }
    });

    it("should accept multiple requested changes", () => {
      const result = submitChangeRequestSchema.safeParse({
        reason: "Update service and discount",
        requestedChanges: {
          serviceId: mockObjectId(),
          discountAmount: 30000,
          serviceHourType: "OVERTIME",
        },
      });
      expect(result.success).toBe(true);
    });

    it("should reject unknown fields (strict mode)", () => {
      const payload = {
        ...validPayload,
        status: "PENDING",
      };
      const result = submitChangeRequestSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  describe("approveChangeRequestSchema", () => {
    const validPayload = {
      approvalReference: "REF-001",
    };

    it("should validate change request approval without review note", () => {
      const result = approveChangeRequestSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("should accept optional review note", () => {
      const result = approveChangeRequestSchema.safeParse({
        reviewNote: "Approved - reasonable discount",
      });
      expect(result.success).toBe(true);
    });

    it("should accept optional approval reference", () => {
      const result = approveChangeRequestSchema.safeParse({
        approvalReference: "REF-2026-001",
      });
      expect(result.success).toBe(true);
    });

    it("should accept both review note and approval reference", () => {
      const result = approveChangeRequestSchema.safeParse({
        reviewNote: "Approved",
        approvalReference: "REF-2026-001",
      });
      expect(result.success).toBe(true);
    });

    it("should trim whitespace from review note", () => {
      const result = approveChangeRequestSchema.safeParse({
        reviewNote: "  Approved with notes  ",
      });
      if (result.success) {
        expect(result.data.reviewNote).toBe("Approved with notes");
      }
    });

    it("should reject unknown fields (strict mode)", () => {
      const result = approveChangeRequestSchema.safeParse({
        status: "APPROVED",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("rejectChangeRequestSchema", () => {
    it("should validate rejection with reason", () => {
      const result = rejectChangeRequestSchema.safeParse({
        reviewNote: "Discount exceeds limit",
      });
      expect(result.success).toBe(true);
    });

    it("should require review note for rejection", () => {
      const result = rejectChangeRequestSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("should allow various rejection reasons", () => {
      const reasons = [
        "Discount exceeds limit",
        "Customer not eligible",
        "Service unavailable",
      ];
      reasons.forEach((reason) => {
        const result = rejectChangeRequestSchema.safeParse({
          reviewNote: reason,
        });
        expect(result.success).toBe(true);
      });
    });

    it("should trim whitespace from review note", () => {
      const result = rejectChangeRequestSchema.safeParse({
        reviewNote: "  Reason for rejection  ",
      });
      if (result.success) {
        expect(result.data.reviewNote).toBe("Reason for rejection");
      }
    });

    it("should reject unknown fields (strict mode)", () => {
      const result = rejectChangeRequestSchema.safeParse({
        reviewNote: "Rejected",
        reason: "Extra field",
      });
      expect(result.success).toBe(false);
    });
  });
});
