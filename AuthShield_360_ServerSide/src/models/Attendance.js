import mongoose from "mongoose";
import { createModel } from "./modelFactory.js";

const attendanceSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true
    },
    className: {
      type: String,
      required: true,
      trim: true
    },
    attendanceDate: {
      type: Date,
      required: true
    },
    status: {
      type: String,
      enum: ["present", "absent", "late", "excused"],
      required: true
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 500,
      default: ""
    },
    markedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    }
  },
  { timestamps: true }
);

attendanceSchema.index({ student: 1, className: 1, attendanceDate: 1 }, { unique: true });

export default createModel("Attendance", attendanceSchema);