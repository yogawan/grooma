// @/services/customerService.ts
import type { SessionUser } from "@/lib/auth";
import { Errors } from "@/lib/errors";
import { connectDB } from "@/lib/mongodb";
import { escapeRegex } from "@/lib/utils";
import CustomerModel from "@/models/Customer";
import type {
  CreateCustomerInput,
  SetCustomerStatusInput,
  UpdateCustomerInput,
} from "@/validations/customerSchema";

// Indonesian local numbers are written as 0812..., 62812..., or +62812... —
// normalize to the bare 62-prefixed form so a dedupe/search match isn't
// defeated just because someone typed it differently (§5.3).
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) {
    return `62${digits.slice(1)}`;
  }
  return digits;
}

function phoneVariants(phone: string): string[] {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    return [];
  }

  const local = normalized.startsWith("62")
    ? `0${normalized.slice(2)}`
    : normalized;

  return Array.from(new Set([normalized, local, `+${normalized}`]));
}

interface CustomerLike {
  _id: { toString(): string };
  customerCode?: string | null;
  name: string;
  phone?: string | null;
  email?: string | null;
  gender?: string;
  birthDate?: Date | null;
  address?: string | null;
  notes?: string | null;
  customerType: string;
  loyaltyPoints: number;
  lastVisitAt?: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// AGENT gets an operational subset; full PII (email, birthDate, address,
// notes) is HOST-only (§5.3, §7.5). Disallowed fields are set to `undefined`
// rather than omitted here so every caller can rely on one consistent
// shape — `undefined` keys are dropped by JSON.stringify in the response.
function serializeCustomer(customer: CustomerLike, role: SessionUser["role"]) {
  const isPrivileged = role === "HOST";

  return {
    id: customer._id.toString(),
    customerCode: customer.customerCode ?? null,
    name: customer.name,
    phone: customer.phone ?? null,
    customerType: customer.customerType,
    loyaltyPoints: customer.loyaltyPoints,
    lastVisitAt: customer.lastVisitAt ?? null,
    isActive: customer.isActive,
    email: isPrivileged ? (customer.email ?? null) : undefined,
    gender: isPrivileged ? customer.gender : undefined,
    birthDate: isPrivileged ? (customer.birthDate ?? null) : undefined,
    address: isPrivileged ? (customer.address ?? null) : undefined,
    notes: isPrivileged ? (customer.notes ?? null) : undefined,
    createdAt: customer.createdAt,
    updatedAt: customer.updatedAt,
  };
}

export async function createCustomer(
  input: CreateCustomerInput,
  role: SessionUser["role"],
) {
  await connectDB();

  if (input.phone) {
    const variants = phoneVariants(input.phone);
    const existing = await CustomerModel.findOne({ phone: { $in: variants } });
    if (existing) {
      // Don't let formatting differences spawn a duplicate customer record.
      return serializeCustomer(existing, role);
    }
  }

  const customer = await CustomerModel.create(input);
  return serializeCustomer(customer, role);
}

export async function listCustomers(
  role: SessionUser["role"],
  search?: string,
) {
  await connectDB();

  const filter: Record<string, unknown> = {};
  if (search) {
    const orConditions: Record<string, unknown>[] = [
      { name: { $regex: escapeRegex(search), $options: "i" } },
    ];

    const variants = phoneVariants(search);
    if (variants.length > 0) {
      orConditions.push({ phone: { $in: variants } });
    }

    filter.$or = orConditions;
  }

  const customers = await CustomerModel.find(filter).sort({ name: 1 });
  return customers.map((customer) => serializeCustomer(customer, role));
}

export async function getCustomerById(id: string, role: SessionUser["role"]) {
  await connectDB();
  const customer = await CustomerModel.findById(id);

  if (!customer) {
    throw Errors.notFound("Customer not found.");
  }

  return serializeCustomer(customer, role);
}

export async function updateCustomer(
  id: string,
  input: UpdateCustomerInput,
  role: SessionUser["role"],
) {
  await connectDB();
  const customer = await CustomerModel.findById(id);

  if (!customer) {
    throw Errors.notFound("Customer not found.");
  }

  if (input.name !== undefined) customer.name = input.name;
  if (input.phone !== undefined) customer.phone = input.phone;
  if (input.email !== undefined) customer.email = input.email;
  if (input.gender !== undefined) customer.gender = input.gender;
  if (input.birthDate !== undefined) customer.birthDate = input.birthDate;
  if (input.address !== undefined) customer.address = input.address;
  if (input.notes !== undefined) customer.notes = input.notes;

  await customer.save();
  return serializeCustomer(customer, role);
}

export async function setCustomerStatus(
  id: string,
  input: SetCustomerStatusInput,
  role: SessionUser["role"],
) {
  await connectDB();
  const customer = await CustomerModel.findById(id);

  if (!customer) {
    throw Errors.notFound("Customer not found.");
  }

  customer.isActive = input.isActive;
  await customer.save();

  return serializeCustomer(customer, role);
}
