import mongoose from "mongoose";
import { createModel } from "./modelFactory.js";

const academicRecordSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },

    type: {
      type: String,
      enum: ["assignment", "exam"],
      required: true,
    },

    subject: {
      type: String,
      required: true,
    },

    title: {
      type: String,
      required: true,
    },

    description: {
      type: String,
      default: "",
    },

    score: {
      type: Number,
      min: 0,
      max: 100,
      default: null,
    },

    maxScore: {
      type: Number,
      min: 1,
      default: 100,
    },

    dueDate: {
      type: Date,
      default: null,
    },

    submittedAt: {
      type: Date,
      default: null,
    },

    gradedAt: {
      type: Date,
      default: null,
    },

    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

export default createModel("AcademicRecord", academicRecordSchema);
