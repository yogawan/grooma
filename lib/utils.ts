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

  return { subtotal, discountAmount, total, ownerRevenue, employeeRevenue };
}

// 1,000 IDR = 1 point, floor-rounded (§5.3) — basis is `total` (post-discount,
// what the customer actually paid), matching ownerRevenue/employeeRevenue's
// own basis above. Shared by transaction creation (CASH/SELF_RECORDED, paid
// immediately) and the Midtrans webhook (MANAGED QRIS, paid on settlement) so
// both crediting paths compute the same number from the same formula.
export function computeLoyaltyPoints(total: number): number {
  return Math.floor(total / 1000);
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Works whether a populated ref field is a raw ObjectId or a populated
// sub-document (Mongoose returns either depending on whether .populate()
// was called on that path).
//
// Absent or unidentifiable input yields "" rather than a stringified
// "null"/"undefined"/"[object Object]". That distinction is load-bearing:
// every caller feeds the result straight into requireBranchAccess, where a
// fabricated non-empty string is a real comparison target, while "" can
// never equal a branch id — so a missing ref fails closed instead of
// silently becoming a branch identifier that merely happens not to match.
export function extractRefId(ref: unknown): string {
  if (ref === null || ref === undefined) {
    return "";
  }

  if (typeof ref !== "object") {
    return String(ref);
  }

  const candidate = ref as { _id?: unknown; toString: () => string };

  // Populated sub-document: its own _id may itself be an ObjectId or any
  // object with a meaningful toString, so defer to String() rather than
  // recursing (a bare { toString } holder has no _id of its own).
  if (candidate._id !== undefined && candidate._id !== null) {
    return String(candidate._id);
  }

  // An unpopulated ref is a BSON ObjectId: no _id of its own, but it
  // overrides toString to produce its hex form. A plain object inherits
  // Object.prototype.toString and carries no id at all.
  if (candidate.toString !== Object.prototype.toString) {
    return String(ref);
  }

  return "";
}
