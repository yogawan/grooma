// @/models/Attendance.ts
import mongoose, { Schema, model, models } from "mongoose";

const AttendanceSchema = new Schema(
  {
    employee: {
      type: Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
    },

    attendanceDate: {
      type: Date,
      required: true,
    },

    checkInAt: {
      type: Date,
    },

    checkOutAt: {
      type: Date,
    },

    status: {
      type: String,
      enum: ["PRESENT", "LATE", "ABSENT", "LEAVE", "SICK"],
      default: "PRESENT",
    },

    source: {
      type: String,
      enum: ["MANUAL", "FINGERPRINT"],
      default: "MANUAL",
    },

    notes: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

AttendanceSchema.index({ employee: 1, attendanceDate: 1 }, { unique: true });

export default models.Attendance || model("Attendance", AttendanceSchema);
