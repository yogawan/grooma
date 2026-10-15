// @/models/User.ts
import { model, models, Schema } from "mongoose";

const UserSchema = new Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },

    password: {
      type: String,
      required: true,
      select: false,
    },

    // Only the two roles this service owns. The admin backend sharing this
    // database declares its own schema and is what writes GROOMA_ADMIN rows;
    // this enum constrains writes from here, and Mongoose does not validate
    // on read, so existing admin rows still load fine (they are turned away
    // at the session boundary instead — see lib/auth.ts isServiceRole).
    role: {
      type: String,
      enum: ["AGENT", "HOST"],
      required: true,
      default: "AGENT",
    },

    branch: {
      type: Schema.Types.ObjectId,
      ref: "Branch",
      default: null,
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

UserSchema.pre("validate", function () {
  if (this.role === "AGENT" && !this.branch) {
    this.invalidate("branch", "Branch is required for AGENT role.");
    return;
  }

  if (this.role !== "AGENT" && this.branch) {
    this.invalidate("branch", "Branch must be null for HOST role.");
  }
});

export default models.User || model("User", UserSchema);
