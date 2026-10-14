// @/models/Customer.ts
import { Schema, model, models } from "mongoose";

const CustomerSchema = new Schema(
  {
    customerCode: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    phone: {
      type: String,
      trim: true,
    },

    email: {
      type: String,
      lowercase: true,
      trim: true,
    },

    gender: {
      type: String,
      enum: ["MALE", "FEMALE", "OTHER", "UNSPECIFIED"],
      default: "UNSPECIFIED",
    },

    birthDate: {
      type: Date,
    },

    address: {
      type: String,
      trim: true,
    },

    notes: {
      type: String,
      trim: true,
    },

    customerType: {
      type: String,
      enum: ["DECOY", "REGULAR"],
      default: "REGULAR",
    },

    loyaltyPoints: {
      type: Number,
      default: 0,
      min: 0,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    lastVisitAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

CustomerSchema.index({ phone: 1 });
CustomerSchema.index({ name: 1 });

export default models.Customer || model("Customer", CustomerSchema);
