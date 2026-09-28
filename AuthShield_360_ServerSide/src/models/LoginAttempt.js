import mongoose from "mongoose";
import { createModel } from "./modelFactory.js";

const loginAttemptSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    username: {
      type: String,
      required: true,
    },

    authenticationMode: {
      type: String,
      enum: ["password-only", "password+mfa", "password+mfa+email"],
      required: true,
    },

    factor: {
      type: String,
      enum: ["password", "otp", "email_otp", "none"],
      required: true,
    },

    result: {
      type: String,
      enum: ["success", "failure"],
      required: true,
    },

    failureReason: {
      type: String,
      enum: [
        "invalid_password",
        "invalid_otp",
        "expired_otp",
        "expired_otp",
        "mfa_required",
        "account_locked",
        "account_disabled",
        "rate_limited",
        "unknown_user",
        "none",
      ],
      default: "none",
    },

    ipAddress: String,

    userAgent: String,

    durationMs: Number,

    startedAt: Date,

    completedAt: Date,
  },
  {
    timestamps: true,
  }
);

export default createModel("LoginAttempt", loginAttemptSchema);
