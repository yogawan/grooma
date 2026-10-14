// @/models/Subscription.ts
import { Schema, model, models } from "mongoose";
import type { Document } from "mongoose";

interface ISubscription extends Document {
  host: Schema.Types.ObjectId;
  plan: Schema.Types.ObjectId;
  status: "ACTIVE" | "PAST_DUE" | "EXPIRED" | "CANCELLED";
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  graceEndsAt?: Date;
  cancelledAt?: Date;
  cancelReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const SubscriptionSchema = new Schema<ISubscription>(
  {
    host: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
      unique: true,
    },
    plan: {
      type: Schema.Types.ObjectId,
      ref: "SubscriptionPlan",
      required: true,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "PAST_DUE", "EXPIRED", "CANCELLED"],
      default: "ACTIVE",
      index: true,
    },
    currentPeriodStart: {
      type: Date,
      required: true,
    },
    currentPeriodEnd: {
      type: Date,
      required: true,
    },
    graceEndsAt: {
      type: Date,
    },
    cancelledAt: {
      type: Date,
    },
    cancelReason: {
      type: String,
      maxlength: 500,
    },
  },
  { timestamps: true },
);

export default models.Subscription ||
  model<ISubscription>("Subscription", SubscriptionSchema);
