import mongoose from "mongoose";
import { createModel } from "./modelFactory.js";

const sessionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    sessionTokenHash: {
      type: String,
      required: true,
      unique: true,
      select: false,
    },

    ipAddress: {
      type: String,
    },

    userAgent: {
      type: String,
    },

    authenticatedWithMfa: {
      type: Boolean,
      default: false,
    },

    mfaSetupRequired: {
      type: Boolean,
      default: false,
    },

    mfaVerifiedAt: {
      type: Date,
      default: null,
    },

    emailOtpRequired: {
      type: Boolean,
      default: false,
    },

    emailFactorSetupPending: {
      type: Boolean,
      default: false,
    },

    emailOtpHash: {
      type: String,
      select: false,
    },

    emailOtpExpiresAt: {
      type: Date,
      default: null,
    },

    emailOtpAttempts: {
      type: Number,
      default: 0,
    },

    createdAt: {
      type: Date,
      default: Date.now,
    },

    expiresAt: {
      type: Date,
      required: true,
    },

    revokedAt: {
      type: Date,
      default: null,
    },
  }
);

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default createModel("Session", sessionSchema);
