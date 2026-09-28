import mongoose from "mongoose";
import { createModel } from "./modelFactory.js";

const passwordCredentialSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    passwordHash: {
      type: String,
      required: true,
      select: false,
    },

    algorithm: {
      type: String,
      default: "bcrypt",
    },

    passwordChangedAt: {
      type: Date,
      default: Date.now,
    },

    failedAttempts: {
      type: Number,
      default: 0,
    },

    lockedUntil: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

export default createModel("PasswordCredential", passwordCredentialSchema);
