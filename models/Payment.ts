// @/models/Payment.ts
import { model, models, Schema } from "mongoose";

const PaymentSchema = new Schema(
  {
    transaction: {
      type: Schema.Types.ObjectId,
      ref: "Transaction",
      required: true,
    },

    provider: {
      type: String,
      enum: ["MIDTRANS"],
      default: "MIDTRANS",
      required: true,
    },

    providerOrderId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    providerTransactionId: {
      type: String,
      trim: true,
    },

    paymentType: {
      type: String,
      trim: true,
    },

    // EXPIRED included from the start (§1 decision) so an expired QRIS code
    // is distinguishable from an outright failed payment.
    status: {
      type: String,
      enum: ["PENDING", "PAID", "FAILED", "EXPIRED", "REFUNDED"],
      default: "PENDING",
    },

    grossAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    currency: {
      type: String,
      default: "IDR",
    },

    qrCodeUrl: {
      type: String,
      trim: true,
    },

    qrString: {
      type: String,
      trim: true,
    },

    expiresAt: {
      type: Date,
    },

    paidAt: {
      type: Date,
    },

    lastNotificationAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

PaymentSchema.index({ transaction: 1, createdAt: -1 });
PaymentSchema.index({ status: 1 });

export default models.Payment || model("Payment", PaymentSchema);
