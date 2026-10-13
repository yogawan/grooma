// @/services/inventory.service.ts
import mongoose from "mongoose";
import type { SessionUser } from "@/lib/auth";
import { requireBranchAccess } from "@/lib/authorization";
import { Errors } from "@/lib/errors";
import { connectDB } from "@/lib/mongodb";
import { escapeRegex, extractRefId } from "@/lib/utils";
import BranchModel from "@/models/Branch";
import InventoryModel from "@/models/Inventory";
import InventoryMovementModel from "@/models/InventoryMovement";
import type {
  CreateInventoryInput,
  ListInventoryQuery,
  ListStockMovementsQuery,
  StockMovementInput,
  UpdateInventoryInput,
} from "@/validations/inventory.schema";

// HOST has no "own" branch to default to, so must name one explicitly;
// AGENT's is always their session branch, regardless of what (if anything)
// they sent — same precedent as Transaction creation (§7.10, §11.3).
async function resolveTargetBranchId(
  user: SessionUser,
  inputBranchId: string | undefined,
): Promise<string> {
  if (user.role === "HOST") {
    if (!inputBranchId) {
      throw Errors.validation("branchId is required for HOST.");
    }
    const exists = await BranchModel.exists({ _id: inputBranchId });
    if (!exists) {
      throw Errors.validation("Branch does not exist.");
    }
    return inputBranchId;
  }

  if (!user.branch) {
    throw Errors.businessRule("Agent has no assigned branch.");
  }
  return user.branch;
}

export async function createItem(
  user: SessionUser,
  input: CreateInventoryInput,
) {
  await connectDB();

  const branchId = await resolveTargetBranchId(user, input.branchId);
  const initialQuantity = input.quantity ?? 0;

  const session = await mongoose.startSession();
  try {
    let item: InstanceType<typeof InventoryModel> | undefined;

    await session.withTransaction(async (txSession) => {
      const [created] = await InventoryModel.create(
        [
          {
            itemCode: input.itemCode,
            branch: branchId,
            name: input.name,
            category: input.category,
            unit: input.unit,
            quantity: initialQuantity,
            unitCost: input.unitCost,
            minimumStock: input.minimumStock,
            supplier: input.supplier,
          },
        ],
        { session: txSession },
      );

      if (initialQuantity > 0) {
        await InventoryMovementModel.create(
          [
            {
              inventory: created._id,
              branch: branchId,
              movementType: "IN",
              quantity: initialQuantity,
              previousQuantity: 0,
              newQuantity: initialQuantity,
              reason: "Initial stock on item creation",
              performedBy: user.id,
            },
          ],
          { session: txSession },
        );
      }

      item = created;
    });

    return item as InstanceType<typeof InventoryModel>;
  } finally {
    await session.endSession();
  }
}

export async function listItems(user: SessionUser, query: ListInventoryQuery) {
  await connectDB();

  const filter: Record<string, unknown> = {};

  if (user.role === "HOST") {
    if (query.branchId) filter.branch = query.branchId;
  } else {
    if (!user.branch) {
      throw Errors.businessRule("Agent has no assigned branch.");
    }
    filter.branch = user.branch;
  }

  if (query.search) {
    filter.name = { $regex: escapeRegex(query.search), $options: "i" };
  }

  // "Low stock" compares two fields on the same document (quantity vs
  // minimumStock), which a plain field filter can't express — needs $expr.
  if (query.lowStockOnly) {
    filter.$expr = { $lte: ["$quantity", "$minimumStock"] };
  }

  const skip = (query.page - 1) * query.limit;

  const [items, total] = await Promise.all([
    InventoryModel.find(filter)
      .sort({ name: 1 })
      .skip(skip)
      .limit(query.limit)
      .populate("branch", "name"),
    InventoryModel.countDocuments(filter),
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

export async function getItemById(user: SessionUser, id: string) {
  await connectDB();

  const item = await InventoryModel.findById(id).populate("branch", "name");
  if (!item) {
    throw Errors.notFound("Inventory item not found.");
  }

  requireBranchAccess(user, extractRefId(item.branch));
  return item;
}

export async function updateItem(
  user: SessionUser,
  id: string,
  input: UpdateInventoryInput,
) {
  await connectDB();

  const item = await InventoryModel.findById(id);
  if (!item) {
    throw Errors.notFound("Inventory item not found.");
  }

  requireBranchAccess(user, extractRefId(item.branch));

  if (input.name !== undefined) item.name = input.name;
  if (input.category !== undefined) item.category = input.category;
  if (input.unit !== undefined) item.unit = input.unit;
  if (input.unitCost !== undefined) item.unitCost = input.unitCost;
  if (input.minimumStock !== undefined) item.minimumStock = input.minimumStock;
  if (input.supplier !== undefined) item.supplier = input.supplier;

  await item.save();
  return item;
}

// §7.10/§11.3: DELETE is a real HTTP DELETE but always a soft delete —
// items with stock history can never be permanently removed (§5.6).
export async function softDeleteItem(user: SessionUser, id: string) {
  await connectDB();

  const item = await InventoryModel.findById(id);
  if (!item) {
    throw Errors.notFound("Inventory item not found.");
  }

  requireBranchAccess(user, extractRefId(item.branch));

  item.isActive = false;
  await item.save();
  return item;
}

export async function adjustStock(
  user: SessionUser,
  id: string,
  input: StockMovementInput,
) {
  await connectDB();

  // Authorization doesn't change between automatic transaction retries, so
  // check it once up front rather than repeatedly inside the callback.
  const preCheck = await InventoryModel.findById(id).select("branch isActive");
  if (!preCheck) {
    throw Errors.notFound("Inventory item not found.");
  }
  requireBranchAccess(user, extractRefId(preCheck.branch));
  if (!preCheck.isActive) {
    throw Errors.businessRule("Cannot adjust stock for an inactive item.");
  }

  const session = await mongoose.startSession();

  try {
    let result:
      | {
          item: InstanceType<typeof InventoryModel>;
          movement: InstanceType<typeof InventoryMovementModel>;
        }
      | undefined;

    // Lost-update prevention here comes from MongoDB's native transaction
    // write-conflict detection, not a manual CAS filter: if two concurrent
    // transactions touch the same document, one gets a WriteConflict
    // carrying the TransientTransactionError label, and withTransaction
    // retries by re-running this whole callback against fresh data
    // (§5.6, §11.3). This also makes the Inventory update and the
    // InventoryMovement record atomic (§5.7).
    await session.withTransaction(async (txSession) => {
      const item = await InventoryModel.findById(id).session(txSession);
      if (!item) {
        throw Errors.notFound("Inventory item not found.");
      }

      const previousQuantity = item.quantity;
      let newQuantity: number;

      if (input.movementType === "IN") {
        newQuantity = previousQuantity + input.quantity;
      } else if (input.movementType === "OUT") {
        newQuantity = previousQuantity - input.quantity;
      } else {
        newQuantity = input.newQuantity;
      }

      if (newQuantity < 0) {
        throw Errors.businessRule("Stock quantity cannot go negative.");
      }

      item.quantity = newQuantity;
      await item.save({ session: txSession });

      const [movement] = await InventoryMovementModel.create(
        [
          {
            inventory: item._id,
            branch: item.branch,
            movementType: input.movementType,
            quantity: Math.abs(newQuantity - previousQuantity),
            previousQuantity,
            newQuantity,
            reason: input.reason,
            performedBy: user.id,
          },
        ],
        { session: txSession },
      );

      result = { item, movement };
    });

    return result as {
      item: InstanceType<typeof InventoryModel>;
      movement: InstanceType<typeof InventoryMovementModel>;
    };
  } finally {
    await session.endSession();
  }
}

export async function listStockMovements(
  user: SessionUser,
  itemId: string,
  query: ListStockMovementsQuery,
) {
  await connectDB();

  const item = await InventoryModel.findById(itemId).select("branch");
  if (!item) {
    throw Errors.notFound("Inventory item not found.");
  }
  requireBranchAccess(user, extractRefId(item.branch));

  const skip = (query.page - 1) * query.limit;

  const [items, total] = await Promise.all([
    InventoryMovementModel.find({ inventory: itemId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(query.limit)
      .populate("performedBy", "name"),
    InventoryMovementModel.countDocuments({ inventory: itemId }),
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
