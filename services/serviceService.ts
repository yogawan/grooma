// @/services/serviceService.ts
import type { SessionUser } from "@/lib/auth";
import { Errors } from "@/lib/errors";
import { connectDB } from "@/lib/mongodb";
import { paginateQueries, paginationSkip, stableSort } from "@/lib/pagination";
import ServiceModel from "@/models/Service";
import type {
  CreateServiceInput,
  ListServicesQuery,
  SetServiceStatusInput,
  UpdateServiceInput,
} from "@/validations/serviceSchema";

export async function createService(input: CreateServiceInput) {
  await connectDB();
  // revenueSharing-sums-to-100 is enforced by the model's own pre-validate
  // hook; a violation surfaces as a clean 400 via handleApiError's
  // mongoose ValidationError handling, not a raw 500.
  return ServiceModel.create(input);
}

// §7.6: "List active services" — AGENT can only ever pick an active one
// when building a transaction, so the filter is forced regardless of what
// the client sends. HOST manages the catalog and needs to see everything.
export async function listServices(
  role: SessionUser["role"],
  query: ListServicesQuery,
) {
  await connectDB();

  // AGENT only ever sees the active catalogue (§7.6) — the filter is part of
  // the count too, so `total` reflects what that role can actually reach
  // rather than the whole collection.
  const filter: Record<string, unknown> =
    role === "HOST" ? {} : { isActive: true };

  return paginateQueries(
    ServiceModel.find(filter)
      .sort(stableSort({ name: 1 }))
      .skip(paginationSkip(query))
      .limit(query.limit),
    ServiceModel.countDocuments(filter),
    query,
  );
}

export async function getServiceById(id: string) {
  await connectDB();
  const service = await ServiceModel.findById(id);

  if (!service) {
    throw Errors.notFound("Service not found.");
  }

  return service;
}

export async function updateService(id: string, input: UpdateServiceInput) {
  await connectDB();
  const service = await ServiceModel.findById(id);

  if (!service) {
    throw Errors.notFound("Service not found.");
  }

  if (input.name !== undefined) service.name = input.name;
  if (input.description !== undefined) service.description = input.description;
  if (input.category !== undefined) service.category = input.category;
  if (input.price !== undefined) service.price = input.price;
  if (input.durationMinutes !== undefined) {
    service.durationMinutes = input.durationMinutes;
  }
  if (input.revenueSharing !== undefined) {
    service.revenueSharing = input.revenueSharing;
  }

  await service.save();
  return service;
}

export async function setServiceStatus(
  id: string,
  input: SetServiceStatusInput,
) {
  await connectDB();
  const service = await ServiceModel.findById(id);

  if (!service) {
    throw Errors.notFound("Service not found.");
  }

  service.isActive = input.isActive;
  await service.save();

  return service;
}
