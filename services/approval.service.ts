// @/services/approval.service.ts
import type { SessionUser } from "@/lib/auth";
import { requireBranchAccess } from "@/lib/authorization";
import { Errors } from "@/lib/errors";
import { connectDB } from "@/lib/mongodb";
import { computeServicePricing, extractRefId } from "@/lib/utils";
import CustomerModel from "@/models/Customer";
import ServiceModel from "@/models/Service";
import TransactionModel from "@/models/Transaction";
import type {
  ApproveChangeRequestInput,
  ListChangeRequestsQuery,
  RejectChangeRequestInput,
  SubmitChangeRequestInput,
} from "@/validations/approval.schema";

interface RequestedChanges {
  serviceId?: string;
  customerId?: string | null;
  discountAmount?: number;
  serviceHourType?: "REGULAR" | "OVERTIME";
}

export async function submitChangeRequest(
  user: SessionUser,
  transactionId: string,
  input: SubmitChangeRequestInput,
) {
  await connectDB();

  const transaction = await TransactionModel.findById(transactionId);
  if (!transaction) {
    throw Errors.notFound("Transaction not found.");
  }

  requireBranchAccess(user, extractRefId(transaction.branch));

  if (transaction.transactionStatus === "CANCELLED") {
    throw Errors.conflict("Cannot request changes on a cancelled transaction.");
  }

  // §5.8: only one ACTIVE (pending) request at a time — a transaction
  // whose previous request was already approved/rejected can take a new
  // one, since that request is no longer "active".
  if (transaction.changeRequest.status === "PENDING") {
    throw Errors.conflict(
      "A pending change request already exists for this transaction.",
    );
  }

  const changes = input.requestedChanges as RequestedChanges;

  // Fail fast at submission time even though approval re-validates again
  // later — state can still drift between submission and review (§10.1
  // step 9), but there's no reason to let an obviously-bad request sit in
  // the queue untouched.
  if (changes.serviceId) {
    const service = await ServiceModel.findById(changes.serviceId);
    if (!service || !service.isActive) {
      throw Errors.businessRule("Requested service is not available.");
    }
  }
  if (changes.customerId) {
    const customer = await CustomerModel.findById(changes.customerId);
    if (!customer || !customer.isActive) {
      throw Errors.businessRule("Requested customer is not available.");
    }
  }

  // Full replacement (not field-by-field mutation) so a prior request's
  // leftover reviewedBy/reviewNote/reviewedAt never lingers into this one.
  transaction.changeRequest = {
    status: "PENDING",
    requestedBy: user.id,
    reason: input.reason,
    requestedChanges: changes,
    requestedAt: new Date(),
  };

  await transaction.save();
  return transaction;
}

export async function listPendingChangeRequests(
  query: ListChangeRequestsQuery,
) {
  await connectDB();

  const filter = { "changeRequest.status": "PENDING" };
  const skip = (query.page - 1) * query.limit;

  const [items, total] = await Promise.all([
    TransactionModel.find(filter)
      .sort({ "changeRequest.requestedAt": -1 })
      .skip(skip)
      .limit(query.limit)
      .populate("branch", "name")
      .populate("agent", "name")
      .populate("changeRequest.requestedBy", "name"),
    TransactionModel.countDocuments(filter),
  ]);

  return {
    items,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

// §7.9: HOST can view any request's detail; an AGENT may only view one
// they submitted themselves (the "id" here is the transaction's id — a
// change request has no collection/id of its own, §5.8's MVP design).
export async function getChangeRequestById(
  user: SessionUser,
  transactionId: string,
) {
  await connectDB();

  const transaction = await TransactionModel.findById(transactionId)
    .populate("branch", "name")
    .populate("agent", "name")
    .populate("changeRequest.requestedBy", "name")
    .populate("changeRequest.reviewedBy", "name");

  if (!transaction || transaction.changeRequest.status === "NONE") {
    throw Errors.notFound("No change request exists for this transaction.");
  }

  const isRequester =
    extractRefId(transaction.changeRequest.requestedBy) === user.id;
  if (user.role !== "HOST" && !isRequester) {
    throw Errors.forbidden();
  }

  return transaction;
}

export async function approveChangeRequest(
  user: SessionUser,
  transactionId: string,
  input: ApproveChangeRequestInput,
) {
  await connectDB();

  const transaction = await TransactionModel.findById(transactionId);
  if (!transaction) {
    throw Errors.notFound("Transaction not found.");
  }

  const { changeRequest } = transaction;

  if (changeRequest.status !== "PENDING") {
    throw Errors.conflict("This change request is not pending.");
  }

  // §10.2: requester cannot approve their own request.
  if (extractRefId(changeRequest.requestedBy) === user.id) {
    throw Errors.forbidden("Cannot approve your own change request.");
  }

  const changes = changeRequest.requestedChanges as RequestedChanges;
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};

  // §10.1 step 9: re-validate against current state, not whatever was
  // true at submission time.
  let requestedService: InstanceType<typeof ServiceModel> | null = null;
  if (changes.serviceId !== undefined) {
    requestedService = await ServiceModel.findById(changes.serviceId);
    if (!requestedService || !requestedService.isActive) {
      throw Errors.businessRule("Requested service is no longer available.");
    }
  }

  if (changes.serviceId !== undefined || changes.discountAmount !== undefined) {
    const pricingService =
      requestedService ?? (await ServiceModel.findById(transaction.service));
    if (!pricingService || !pricingService.isActive) {
      throw Errors.businessRule(
        "Transaction's current service is no longer available.",
      );
    }

    const effectiveDiscount =
      changes.discountAmount ?? transaction.discountAmount;
    const pricing = computeServicePricing(pricingService, effectiveDiscount);

    before.subtotal = transaction.subtotal;
    before.discountAmount = transaction.discountAmount;
    before.total = transaction.total;
    before.ownerRevenue = transaction.ownerRevenue;
    before.employeeRevenue = transaction.employeeRevenue;
    before.serviceSnapshot = transaction.serviceSnapshot;

    if (requestedService) {
      before.service = transaction.service;
      transaction.service = requestedService._id;
      transaction.serviceSnapshot = {
        name: requestedService.name,
        price: requestedService.price,
        ownerPercentage: requestedService.revenueSharing.ownerPercentage,
        employeePercentage: requestedService.revenueSharing.employeePercentage,
      };
      after.service = requestedService._id;
      after.serviceSnapshot = transaction.serviceSnapshot;
    }

    transaction.subtotal = pricing.subtotal;
    transaction.discountAmount = effectiveDiscount;
    transaction.total = pricing.total;
    transaction.ownerRevenue = pricing.ownerRevenue;
    transaction.employeeRevenue = pricing.employeeRevenue;

    after.subtotal = pricing.subtotal;
    after.discountAmount = effectiveDiscount;
    after.total = pricing.total;
    after.ownerRevenue = pricing.ownerRevenue;
    after.employeeRevenue = pricing.employeeRevenue;
  }

  if (changes.customerId !== undefined) {
    before.customer = transaction.customer;

    if (changes.customerId === null) {
      transaction.customer = null;
    } else {
      const customer = await CustomerModel.findById(changes.customerId);
      if (!customer || !customer.isActive) {
        throw Errors.businessRule("Requested customer is no longer available.");
      }
      transaction.customer = customer._id;
    }

    after.customer = transaction.customer;
  }

  if (changes.serviceHourType !== undefined) {
    before.serviceHourType = transaction.serviceHourType;
    transaction.serviceHourType = changes.serviceHourType;
    after.serviceHourType = changes.serviceHourType;
  }

  // §10.3: permanent, append-only audit record of what was actually
  // applied — separate from changeRequest, which only ever holds the
  // current/latest request's lifecycle state.
  transaction.changeHistory.push({
    changedBy: changeRequest.requestedBy,
    reason: changeRequest.reason,
    before,
    after,
    changedAt: new Date(),
    approvedBy: user.id,
    approvalReference: input.approvalReference,
  });

  transaction.changeRequest.status = "APPROVED";
  transaction.changeRequest.reviewedBy = user.id;
  transaction.changeRequest.reviewNote = input.reviewNote;
  transaction.changeRequest.reviewedAt = new Date();

  await transaction.save();
  return transaction;
}

export async function rejectChangeRequest(
  user: SessionUser,
  transactionId: string,
  input: RejectChangeRequestInput,
) {
  await connectDB();

  const transaction = await TransactionModel.findById(transactionId);
  if (!transaction) {
    throw Errors.notFound("Transaction not found.");
  }

  if (transaction.changeRequest.status !== "PENDING") {
    throw Errors.conflict("This change request is not pending.");
  }

  // §10.1 step 11: transaction stays untouched, only the request record
  // changes — no changeHistory entry, since nothing was applied.
  transaction.changeRequest.status = "REJECTED";
  transaction.changeRequest.reviewedBy = user.id;
  transaction.changeRequest.reviewNote = input.reviewNote;
  transaction.changeRequest.reviewedAt = new Date();

  await transaction.save();
  return transaction;
}
