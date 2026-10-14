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

    role: {
      type: String,
      enum: ["AGENT", "HOST", "GROOMA_ADMIN"],
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

    address: {
      type: String,
      trim: true,
    },

    photoUrl: {
      type: String,
      trim: true,
    },

    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
    },

    compensation: {
      regularSalary: {
        type: Number,
        default: 0,
        min: 0,
      },

      overtimeRate: {
        type: Number,
        default: 0,
        min: 0,
      },

      compensationType: {
        type: String,
        enum: ["FIXED", "COMMISSION", "HYBRID"],
        default: "COMMISSION",
      },
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
    this.invalidate(
      "branch",
      "Branch must be null for HOST and GROOMA_ADMIN roles.",
    );
  }
});

export default models.User || model("User", UserSchema);
