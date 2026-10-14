// @/services/serviceService.ts
import type { SessionUser } from "@/lib/auth";
import { Errors } from "@/lib/errors";
import { connectDB } from "@/lib/mongodb";
import ServiceModel from "@/models/Service";
import type {
  CreateServiceInput,
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
export async function listServices(role: SessionUser["role"]) {
  await connectDB();

  const filter = role === "HOST" ? {} : { isActive: true };
  return ServiceModel.find(filter).sort({ name: 1 });
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
