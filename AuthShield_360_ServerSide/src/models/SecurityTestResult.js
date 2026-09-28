import mongoose from "mongoose";
import { createModel } from "./modelFactory.js";

const securityTestResultSchema = new mongoose.Schema(
  {
    testId: {
      type: String,
      required: true,
      unique: true,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    userRole: {
      type: String,
      enum: ["Student", "Teacher", "Administrator"],
      required: true,
    },

    testAction: {
      type: String,
      required: true,
    },

    expectedResult: {
      type: String,
      required: true,
    },

    actualResult: {
      type: String,
      required: true,
    },

    status: {
      type: String,
      enum: ["PASS", "FAIL", "NOT_TESTED"],
      required: true,
    },

    loginTimeMs: {
      type: Number,
      default: null,
    },

    evidence: [
      {
        type: String,
      },
    ],

    notes: {
      type: String,
      default: "",
    },

    tester: {
      type: String,
      required: true,
    },

    testedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

export default createModel("SecurityTestResult", securityTestResultSchema);
