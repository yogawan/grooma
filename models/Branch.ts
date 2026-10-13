// @/models/Branch.ts
import { model, models, Schema } from "mongoose";

const BranchSchema = new Schema(
  {
    branchCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    address: {
      type: String,
      trim: true,
    },

    phone: {
      type: String,
      trim: true,
    },

    timezone: {
      type: String,
      required: true,
      trim: true,
      default: "Asia/Jakarta",
    },

    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

BranchSchema.index({ status: 1 });

export default models.Branch || model("Branch", BranchSchema);
