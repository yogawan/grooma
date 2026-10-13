import { model, models, Schema } from "mongoose";

// §10.3: changedBy (requester), reason, before/after snapshots, changedAt,
// approvedBy (reviewer), approvalReference. Append-only via the approval
// API — nothing in this codebase ever updates or removes an existing entry.
const ChangeHistorySchema = new Schema(
  {
    changedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    reason: {
      type: String,
      required: true,
      trim: true,
    },

    before: {
      type: Schema.Types.Mixed,
      required: true,
    },

    after: {
      type: Schema.Types.Mixed,
      required: true,
    },

    changedAt: {
      type: Date,
      default: Date.now,
    },

    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    approvalReference: {
      type: String,
      trim: true,
    },
  },
  { _id: false },
);

const TransactionSchema = new Schema(
  {
    transactionCode: {
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

    agent: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    customer: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      default: null,
    },

    service: {
      type: Schema.Types.ObjectId,
      ref: "Service",
      required: true,
    },

    serviceSnapshot: {
      name: {
        type: String,
        required: true,
      },

      price: {
        type: Number,
        required: true,
        min: 0,
      },

      ownerPercentage: {
        type: Number,
        required: true,
        min: 0,
        max: 100,
      },

      employeePercentage: {
        type: Number,
        required: true,
        min: 0,
        max: 100,
      },
    },

    paymentMethod: {
      type: String,
      enum: ["CASH", "QRIS"],
      required: true,
    },

    paymentStatus: {
      type: String,
      enum: ["PENDING", "PAID", "FAILED", "REFUNDED", "PARTIALLY_REFUNDED"],
      default: "PENDING",
    },

    transactionStatus: {
      type: String,
      enum: ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
      default: "PENDING",
    },

    serviceHourType: {
      type: String,
      enum: ["REGULAR", "OVERTIME"],
      default: "REGULAR",
    },

    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },

    discountAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    total: {
      type: Number,
      required: true,
      min: 0,
    },

    ownerRevenue: {
      type: Number,
      required: true,
      min: 0,
    },

    employeeRevenue: {
      type: Number,
      required: true,
      min: 0,
    },

    paymentReference: {
      type: String,
      trim: true,
    },

    paidAt: {
      type: Date,
    },

    completedAt: {
      type: Date,
    },

    changeHistory: {
      type: [ChangeHistorySchema],
      default: [],
    },

    changeRequest: {
      status: {
        type: String,
        enum: ["NONE", "PENDING", "APPROVED", "REJECTED"],
        default: "NONE",
      },

      requestedBy: {
        type: Schema.Types.ObjectId,
        ref: "User",
      },

      reason: {
        type: String,
        trim: true,
      },

      requestedChanges: {
        type: Schema.Types.Mixed,
      },

      reviewedBy: {
        type: Schema.Types.ObjectId,
        ref: "User",
      },

      reviewNote: {
        type: String,
        trim: true,
      },

      requestedAt: {
        type: Date,
      },

      reviewedAt: {
        type: Date,
      },
    },

    receipt: {
      printed: {
        type: Boolean,
        default: false,
      },

      printedAt: {
        type: Date,
      },

      printCount: {
        type: Number,
        default: 0,
        min: 0,
      },
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

TransactionSchema.index({ createdAt: -1 });
TransactionSchema.index({ branch: 1, createdAt: -1 });
TransactionSchema.index({ agent: 1, createdAt: -1 });
TransactionSchema.index({ customer: 1, createdAt: -1 });
TransactionSchema.index({ paymentStatus: 1, createdAt: -1 });
TransactionSchema.index({
  transactionStatus: 1,
  createdAt: -1,
});

export default models.Transaction || model("Transaction", TransactionSchema);
