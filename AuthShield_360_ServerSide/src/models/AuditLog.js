import mongoose from "mongoose";
import { createModel } from "./modelFactory.js";

const auditLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    username: {
      type: String,
      default: null,
    },

    role: {
      type: String,
      enum: ["Student", "Teacher", "Administrator", "Unknown"],
      default: "Unknown",
    },

    eventType: {
      type: String,
      enum: [
        "LOGIN_SUCCESS",
        "LOGIN_FAILURE",
        "MFA_SUCCESS",
        "MFA_FAILURE",
        "ACCOUNT_LOCKED",
        "ACCOUNT_UNLOCKED",
        "ACCESS_GRANTED",
        "ACCESS_DENIED",
        "LOGOUT",
        "SESSION_EXPIRED",
        "SESSION_REVOKED",
        "MFA_ENROLLED",
        "MFA_DISABLED",
        "EMAIL_VERIFIED",
        "ATTENDANCE_MARKED",
        "PASSWORD_CHANGED",
        "ADMIN_ACTION",
      ],
      required: true,
    },

    action: {
      type: String,
      required: true,
    },

    resource: {
      type: String,
      default: null,
    },

    result: {
      type: String,
      enum: ["success", "failure", "denied"],
      required: true,
    },

    ipAddress: String,

    userAgent: String,

    sessionId: String,

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

export default createModel("AuditLog", auditLogSchema);
