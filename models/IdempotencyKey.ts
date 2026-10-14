// @/models/IdempotencyKey.ts
import { model, models, Schema } from "mongoose";

// Backs the Idempotency-Key contract on POST /transactions (§8.2): a
// double-submitted sale must not become two Transaction documents.
//
// The record is created *before* the transaction and completed afterwards,
// so a concurrent duplicate loses the unique-index race and can tell the
// difference between "already finished, here is the original" and "still in
// flight".
const IdempotencyKeySchema = new Schema(
  {
    key: {
      type: String,
      required: true,
      trim: true,
    },

    // Scoped per user so one account can never consume or block another
    // account's key by guessing the string.
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Null while the operation is in flight; set once it succeeded.
    transaction: {
      type: Schema.Types.ObjectId,
      ref: "Transaction",
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

IdempotencyKeySchema.index({ user: 1, key: 1 }, { unique: true });

// Keys are a double-submit guard, not an audit trail — 24h is far longer
// than any retry window a POS client would use.
IdempotencyKeySchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

export default models.IdempotencyKey ||
  model("IdempotencyKey", IdempotencyKeySchema);
