import mongoose from "mongoose";
import { createModel } from "./modelFactory.js";

const mfaMethodSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    type: {
      type: String,
      enum: ["TOTP"],
      default: "TOTP",
    },

    secretEncrypted: {
      type: String,
      required: true,
      select: false,
    },

    enabled: {
      type: Boolean,
      default: false,
    },

    verified: {
      type: Boolean,
      default: false,
    },

    enrolledAt: {
      type: Date,
      default: null,
    },

    lastUsedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

export default createModel("MfaMethod", mfaMethodSchema);
