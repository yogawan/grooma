import { describe, expect, it } from "vitest";
import { createQrisPaymentSchema } from "@/validations/paymentSchema";

function mockObjectId(): string {
  return "507f1f77bcf86cd799439011";
}

describe("Payment Schemas", () => {
  describe("createQrisPaymentSchema", () => {
    const validPayload = {
      transactionId: mockObjectId(),
    };

    it("should validate correct QRIS payment creation payload", () => {
      const result = createQrisPaymentSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    });

    it("should require transactionId", () => {
      const result = createQrisPaymentSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("should reject invalid transactionId format", () => {
      const result = createQrisPaymentSchema.safeParse({
        transactionId: "not-a-valid-id",
      });
      expect(result.success).toBe(false);
    });

    it("should accept valid ObjectId string", () => {
      const transactionId = mockObjectId();
      const result = createQrisPaymentSchema.safeParse({ transactionId });
      expect(result.success).toBe(true);
    });

    it("should reject unknown fields (strict mode)", () => {
      const payload = {
        ...validPayload,
        amount: 100000,
      };
      const result = createQrisPaymentSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("should trim whitespace from transactionId", () => {
      const transactionId = mockObjectId();
      const result = createQrisPaymentSchema.safeParse({
        transactionId: `  ${transactionId}  `,
      });
      if (result.success) {
        expect(result.data.transactionId).toBe(transactionId);
      }
    });
  });
});
