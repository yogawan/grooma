// @/models/SubscriptionPlan.ts
import { Schema, model, models } from "mongoose";
import type { Document } from "mongoose";

export interface ISubscriptionPlan extends Document {
  code: string;
  name: string;
  description?: string;
  price: number;
  currency: string;
  billingCycle: "MONTHLY" | "ANNUAL";
  graceDays: number;
  maxBranches: number;
  isActive: boolean;
  updatedBy?: Schema.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const SubscriptionPlanSchema = new Schema<ISubscriptionPlan>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      minlength: 1,
      maxlength: 32,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      minlength: 1,
      maxlength: 100,
      trim: true,
    },
    description: {
      type: String,
      maxlength: 500,
      trim: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      required: true,
      default: "IDR",
      enum: ["IDR", "USD"],
    },
    billingCycle: {
      type: String,
      required: true,
      enum: ["MONTHLY", "ANNUAL"],
      default: "MONTHLY",
    },
    graceDays: {
      type: Number,
      required: true,
      default: 3,
      min: 0,
      max: 30,
    },
    maxBranches: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true },
);

export default models.SubscriptionPlan ||
  model<ISubscriptionPlan>("SubscriptionPlan", SubscriptionPlanSchema);
