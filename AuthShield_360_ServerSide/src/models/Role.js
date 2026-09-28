import mongoose from "mongoose";
import { createModel } from "./modelFactory.js";

const roleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      enum: ["Student", "Teacher", "Administrator"],
      required: true,
      unique: true,
    },

    permissions: [
      {
        type: String,
        trim: true,
      },
    ],
  },
  {
    timestamps: true,
  }
);

export default createModel("Role", roleSchema);
