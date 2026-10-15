// @/models/Employee.ts
import { model, models, Schema } from "mongoose";

// Scaffold only — not read or written anywhere yet (PRD §5.13). `branch` and
// `compensation` still live on User until one of §5.13's triggers
// (Attendance, Payroll, employment history) is actually in scope. This file
// exists so Attendance.ts's `ref: "Employee"` resolves to a real model
// instead of a dangling reference — don't wire either model to a
// service/route without re-reading §5.13's prerequisites first.
const EmployeeSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    branch: {
      type: Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
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

    employmentStatus: {
      type: String,
      enum: ["ACTIVE", "RESIGNED", "SUSPENDED"],
      default: "ACTIVE",
    },

    joinedAt: {
      type: Date,
      required: true,
    },

    resignedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export default models.Employee || model("Employee", EmployeeSchema);
