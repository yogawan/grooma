// @/models/SubscriptionInvoice.ts
import { Schema, model, models } from "mongoose";
import type { Document } from "mongoose";

export interface ISubscriptionInvoice extends Document {
  subscription: Schema.Types.ObjectId;
  host: Schema.Types.ObjectId;
  invoiceCode: string;
  periodStart: Date;
  periodEnd: Date;
  amount: number;
  status: "PENDING" | "PAID" | "FAILED" | "EXPIRED" | "REFUNDED";
  dueAt: Date;
  paidAt?: Date;
  provider: "MIDTRANS";
  providerOrderId: string;
  providerTransactionId?: string;
  qrCodeUrl?: string;
  qrString?: string;
  expiresAt: Date;
  lastNotificationAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SubscriptionInvoiceSchema = new Schema<ISubscriptionInvoice>(
  {
    subscription: {
      type: Schema.Types.ObjectId,
      ref: "Subscription",
      required: true,
      index: true,
    },
    host: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    invoiceCode: {
      type: String,
      required: true,
      unique: true,
      minlength: 1,
      maxlength: 64,
    },
    periodStart: {
      type: Date,
      required: true,
    },
    periodEnd: {
      type: Date,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ["PENDING", "PAID", "FAILED", "EXPIRED", "REFUNDED"],
      default: "PENDING",
      index: true,
    },
    dueAt: {
      type: Date,
      required: true,
      index: true,
    },
    paidAt: {
      type: Date,
    },
    provider: {
      type: String,
      enum: ["MIDTRANS"],
      required: true,
    },
    providerOrderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    providerTransactionId: {
      type: String,
    },
    qrCodeUrl: {
      type: String,
    },
    qrString: {
      type: String,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    lastNotificationAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

export default models.SubscriptionInvoice ||
  model<ISubscriptionInvoice>("SubscriptionInvoice", SubscriptionInvoiceSchema);
