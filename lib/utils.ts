// @/lib/utils.ts
import { Errors } from "./errors";

export function roundCurrency(value: number): number {
  return Math.round(value);
}

interface PricedService {
  price: number;
  revenueSharing: { ownerPercentage: number; employeePercentage: number };
}

// Shared by transaction creation (§8.2) and approved change-request
// application (§10.1 step 10) so a service/discount correction recomputes
// money the exact same way a brand-new transaction would — never two
// slightly-different formulas for the same invariant.
export function computeServicePricing(
  service: PricedService,
  discountAmount: number,
) {
  const subtotal = service.price;
  if (discountAmount > subtotal) {
    throw Errors.businessRule("Discount cannot exceed the service price.");
  }

  const total = subtotal - discountAmount;
  // employeeRevenue is the remainder (not its own percentage-of-total
  // calc) so the two always sum exactly to `total` with no floating-point
  // drift.
  const ownerRevenue = roundCurrency(
    total * (service.revenueSharing.ownerPercentage / 100),
  );
  const employeeRevenue = total - ownerRevenue;

  return { subtotal, total, ownerRevenue, employeeRevenue };
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Works whether a populated ref field is a raw ObjectId or a populated
// sub-document (Mongoose returns either depending on whether .populate()
// was called on that path).
export function extractRefId(ref: unknown): string {
  if (ref && typeof ref === "object" && "_id" in ref) {
    return String((ref as { _id: unknown })._id);
  }
  return String(ref);
}
