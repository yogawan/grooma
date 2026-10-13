// @/models/Inventory.ts
import { model, models, Schema } from "mongoose";

const InventorySchema = new Schema(
  {
    itemCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    branch: {
      type: Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    category: {
      type: String,
      enum: ["HAIR_PRODUCT", "EQUIPMENT", "CONSUMABLE", "OTHER"],
      default: "OTHER",
    },

    unit: {
      type: String,
      default: "PCS",
      trim: true,
    },

    quantity: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },

    unitCost: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },

    minimumStock: {
      type: Number,
      default: 5,
      min: 0,
    },

    supplier: {
      type: String,
      trim: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

InventorySchema.virtual("totalValue").get(function () {
  return this.quantity * this.unitCost;
});

InventorySchema.virtual("isLowStock").get(function () {
  return this.quantity <= this.minimumStock;
});

InventorySchema.set("toJSON", {
  virtuals: true,
});

InventorySchema.set("toObject", {
  virtuals: true,
});

InventorySchema.index({ branch: 1, name: 1 });
InventorySchema.index({ branch: 1, quantity: 1 });

export default models.Inventory || model("Inventory", InventorySchema);
