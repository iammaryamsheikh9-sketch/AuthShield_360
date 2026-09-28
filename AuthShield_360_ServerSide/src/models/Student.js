import mongoose from "mongoose";
import { createModel } from "./modelFactory.js";

const studentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    studentId: {
      type: String,
      required: true,
      unique: true,
    },

    firstName: {
      type: String,
      required: true,
    },

    lastName: {
      type: String,
      required: true,
    },

    className: {
      type: String,
      required: true,
    },

    enrollmentYear: {
      type: Number,
      required: true,
    },

    status: {
      type: String,
      enum: ["active", "inactive", "graduated"],
      default: "active",
    },
  },
  {
    timestamps: true,
  }
);

export default createModel("Student", studentSchema);
