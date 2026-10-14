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

    // §9.6: the owning HOST account, whose `paymentIntegrationMode` decides
    // whether this branch's QRIS transactions go through Midtrans or are
    // merely recorded. Nullable (not required) because branches created
    // before this field existed have no owner to point at — those fall back
    // to MANAGED, see resolvePaymentIntegrationMode(). Note this field is
    // deliberately NOT an access-control boundary: §3.3 still grants every
    // HOST access to every branch.
    host: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
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
