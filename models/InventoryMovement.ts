// @/models/InventoryMovement.ts
import { model, models, Schema } from "mongoose";

const InventoryMovementSchema = new Schema(
  {
    inventory: {
      type: Schema.Types.ObjectId,
      ref: "Inventory",
      required: true,
    },

    branch: {
      type: Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
    },

    movementType: {
      type: String,
      enum: ["IN", "OUT", "ADJUSTMENT"],
      required: true,
    },

    quantity: {
      type: Number,
      required: true,
      min: 0,
    },

    previousQuantity: {
      type: Number,
      required: true,
      min: 0,
    },

    newQuantity: {
      type: Number,
      required: true,
      min: 0,
    },

    reason: {
      type: String,
      required: true,
      trim: true,
    },

    performedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    // Append-only audit log — createdAt only, no updatedAt (§5.7 lists no
    // such field, and a movement record should never be modified).
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  },
);

InventoryMovementSchema.index({ inventory: 1, createdAt: -1 });
InventoryMovementSchema.index({ branch: 1, createdAt: -1 });

export default models.InventoryMovement ||
  model("InventoryMovement", InventoryMovementSchema);
