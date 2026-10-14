// @/models/Service.ts
import { Schema, model, models } from "mongoose";

const ServiceSchema = new Schema(
  {
    serviceCode: {
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

    description: {
      type: String,
      trim: true,
    },

    category: {
      type: String,
      trim: true,
    },

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    durationMinutes: {
      type: Number,
      default: 30,
      min: 1,
    },

    revenueSharing: {
      ownerPercentage: {
        type: Number,
        required: true,
        default: 60,
        min: 0,
        max: 100,
      },

      employeePercentage: {
        type: Number,
        required: true,
        default: 40,
        min: 0,
        max: 100,
      },
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

ServiceSchema.pre("validate", function () {
  const revenueSharing = this.revenueSharing;

  if (!revenueSharing) {
    this.invalidate("revenueSharing", "Revenue sharing is required.");
    return;
  }

  const total =
    revenueSharing.ownerPercentage + revenueSharing.employeePercentage;

  if (total !== 100) {
    this.invalidate(
      "revenueSharing",
      "Owner and employee percentages must total 100%.",
    );
  }
});

ServiceSchema.index({ name: 1, isActive: 1 });

export default models.Service || model("Service", ServiceSchema);
