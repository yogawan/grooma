import { describe, expect, it } from "vitest";
import {
  createTransactionSchema,
  listTransactionsQuerySchema,
} from "@/validations/transactionSchema";

function mockObjectId(): string {
  return "507f1f77bcf86cd799439011";
}

describe("Transaction Schemas", () => {
  describe("createTransactionSchema", () => {
    const validPayload = {
      customerId: mockObjectId(),
      serviceId: mockObjectId(),
      paymentMethod: "CASH",
      discountAmount: 0,
    };

    it("should validate correct transaction creation payload", () => {
      const result = createTransactionSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    });

    it("should accept QRIS payment method", () => {
      const payload = { ...validPayload, paymentMethod: "QRIS" };
      const result = createTransactionSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it("should reject invalid payment method", () => {
      const payload = { ...validPayload, paymentMethod: "CREDIT_CARD" };
      const result = createTransactionSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("should allow optional discount amount", () => {
      const result = createTransactionSchema.safeParse({
        ...validPayload,
        discountAmount: 50000,
      });
      expect(result.success).toBe(true);
    });

    it("should allow optional serviceHourType", () => {
      const result = createTransactionSchema.safeParse({
        ...validPayload,
        serviceHourType: "OVERTIME",
      });
      expect(result.success).toBe(true);
    });

    it("should default serviceHourType to REGULAR", () => {
      const result = createTransactionSchema.safeParse(validPayload);
      if (result.success) {
        expect(result.data.serviceHourType).toBe("REGULAR");
      }
    });

    it("should reject negative discount amount", () => {
      const payload = { ...validPayload, discountAmount: -100 };
      const result = createTransactionSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("should reject fields that should be computed (agentId)", () => {
      const payload = {
        ...validPayload,
        agentId: mockObjectId(),
      };
      const result = createTransactionSchema.safeParse(payload);
      // Strict mode should reject unknown field
      expect(result.success).toBe(false);
    });

    it("should reject fields that should be computed (total)", () => {
      const payload = { ...validPayload, total: 100000 };
      const result = createTransactionSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("should reject fields that should be computed (ownerRevenue)", () => {
      const payload = { ...validPayload, ownerRevenue: 60000 };
      const result = createTransactionSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("should allow customerId to be omitted (no customer recorded)", () => {
      const { customerId, ...payload } = validPayload;
      const result = createTransactionSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it("should require serviceId", () => {
      const { serviceId, ...payload } = validPayload;
      const result = createTransactionSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("should require paymentMethod", () => {
      const { paymentMethod, ...payload } = validPayload;
      const result = createTransactionSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  describe("listTransactionsQuerySchema", () => {
    it("should validate empty query (all defaults)", () => {
      const result = listTransactionsQuerySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("should have default page and limit", () => {
      const result = listTransactionsQuerySchema.safeParse({});
      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(20);
      }
    });

    it("should accept custom page and limit", () => {
      const result = listTransactionsQuerySchema.safeParse({
        page: 2,
        limit: 50,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(2);
        expect(result.data.limit).toBe(50);
      }
    });

    it("should enforce max limit of 100", () => {
      const result = listTransactionsQuerySchema.safeParse({ limit: 101 });
      expect(result.success).toBe(false);
    });

    it("should enforce min page of 1", () => {
      const result = listTransactionsQuerySchema.safeParse({ page: 0 });
      expect(result.success).toBe(false);
    });

    it("should accept search filter", () => {
      const result = listTransactionsQuerySchema.safeParse({
        search: "GRM-20261014-",
      });
      expect(result.success).toBe(true);
    });

    it("should accept paymentStatus filter", () => {
      const result = listTransactionsQuerySchema.safeParse({
        paymentStatus: "PAID",
      });
      expect(result.success).toBe(true);
    });

    it("should accept transactionStatus filter", () => {
      const result = listTransactionsQuerySchema.safeParse({
        transactionStatus: "COMPLETED",
      });
      expect(result.success).toBe(true);
    });

    it("should accept date range filters", () => {
      const from = new Date("2026-10-01");
      const to = new Date("2026-10-31");
      const result = listTransactionsQuerySchema.safeParse({
        from: from.toISOString(),
        to: to.toISOString(),
      });
      expect(result.success).toBe(true);
    });

    it("should reject invalid status values", () => {
      const result = listTransactionsQuerySchema.safeParse({
        paymentStatus: "INVALID_STATUS",
      });
      expect(result.success).toBe(false);
    });

    it("should allow branchId for HOST filter", () => {
      const result = listTransactionsQuerySchema.safeParse({
        branchId: mockObjectId(),
      });
      expect(result.success).toBe(true);
    });

    it("should allow agentId for filtering", () => {
      const result = listTransactionsQuerySchema.safeParse({
        agentId: mockObjectId(),
      });
      expect(result.success).toBe(true);
    });
  });
});
