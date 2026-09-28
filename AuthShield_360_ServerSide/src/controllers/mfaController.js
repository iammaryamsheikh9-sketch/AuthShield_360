import QRCode from "qrcode";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import {
  createMfaEnrollment,
  verifyMfaEnrollment,
  verifyUserMfaCode
} from "../services/mfaService.js";
import MfaMethod from "../models/MfaMethod.js";
import createAuditLog from "../services/auditService.js";
import PasswordCredential from "../models/PasswordCredential.js";
import User from "../models/User.js";
import Session from "../models/Session.js";
import { sendLoginEmailOtp } from "../services/emailVerificationService.js";

const verifyPasswordAndTotp = async (userId, password, otpCode) => {
  if (typeof password !== "string" || !password) throw new Error("Current password is required");
  const credential = await PasswordCredential.findOne({ user: userId }).select("+passwordHash");
  if (!credential || !(await bcrypt.compare(password, credential.passwordHash))) {
    throw new Error("Current password is incorrect");
  }
  const mfaMethod = await MfaMethod.findOne({
    user: userId,
    type: "TOTP",
    enabled: true,
    verified: true
  });
  if (mfaMethod) await verifyUserMfaCode(userId, otpCode);
};

const getMfaStatus = async (req, res) => {
  try {
    const mfaMethod = await MfaMethod.findOne({
      user: req.user._id,
      type: "TOTP"
    });

    return res.status(200).json({
      success: true,
      enabled: mfaMethod ? mfaMethod.enabled && mfaMethod.verified : false,
      emailOtpEnabled: req.user.emailOtpEnabled === true,
      emailVerified: req.user.emailVerified === true,
      enrolledAt: mfaMethod?.enrolledAt || null,
      lastUsedAt: mfaMethod?.lastUsedAt || null
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

const enrollEmailFactor = async (req, res) => {
  try {
    await verifyPasswordAndTotp(req.user._id, req.body.password, req.body.totpCode);
    if (req.user.emailOtpEnabled) {
      return res.status(409).json({ success: false, message: "Email sign-in verification is already enabled" });
    }
    if (req.session.emailFactorSetupPending) {
      return res.status(409).json({ success: false, message: "An email verification code is already pending" });
    }

    req.session.emailFactorSetupPending = true;
    req.session.emailOtpRequired = false;
    req.session.emailOtpHash = null;
    await req.session.save();

    let developmentOtp;
    try {
      developmentOtp = await sendLoginEmailOtp(req.user, req.session);
    } catch (error) {
      req.session.emailFactorSetupPending = false;
      req.session.emailOtpRequired = false;
      req.session.emailOtpHash = null;
      req.session.emailOtpExpiresAt = null;
      req.session.emailOtpAttempts = 0;
      await req.session.save();
      throw error;
    }
    return res.status(200).json({
      success: true,
      message: `A verification code was sent to ${req.user.email}.`,
      ...(developmentOtp ? { developmentOtp } : {})
    });
  } catch (error) {
    console.error("Email factor enrollment error:", error.message);
    return res.status(400).json({ success: false, message: error.message || "Unable to start email verification" });
  }
};

const verifyEmailFactor = async (req, res) => {
  try {
    const otpCode = String(req.body.otpCode || "");
    const session = await Session.findById(req.session._id).select("+emailOtpHash");
    if (!session || !session.emailFactorSetupPending || !session.emailOtpHash) {
      return res.status(400).json({ success: false, message: "No email verification is pending" });
    }
    const now = new Date();
    if (!session.emailOtpExpiresAt || new Date(session.emailOtpExpiresAt) <= now) {
      session.emailFactorSetupPending = false;
      session.emailOtpHash = null;
      await session.save();
      return res.status(400).json({ success: false, message: "Email verification code expired. Start again." });
    }
    if (session.emailOtpAttempts >= 5) {
      session.emailFactorSetupPending = false;
      await session.save();
      return res.status(429).json({ success: false, message: "Too many incorrect codes. Start email verification again." });
    }

    const providedHash = crypto.createHash("sha256").update(otpCode).digest();
    const storedHash = Buffer.from(session.emailOtpHash, "hex");
    const isValid = /^\d{6}$/.test(otpCode) && storedHash.length === providedHash.length && crypto.timingSafeEqual(storedHash, providedHash);
    if (!isValid) {
      session.emailOtpAttempts += 1;
      if (session.emailOtpAttempts >= 5) session.emailFactorSetupPending = false;
      await session.save();
      return res.status(400).json({ success: false, message: session.emailOtpAttempts >= 5 ? "Too many incorrect codes. Start email verification again." : "Invalid email verification code" });
    }

    const user = await User.findById(req.user._id).populate("role");
    if (!user) return res.status(404).json({ success: false, message: "User account not found" });
    user.emailVerified = true;
    user.emailVerifiedAt = user.emailVerifiedAt || now;
    user.emailOtpEnabled = true;
    await user.save();
    session.emailFactorSetupPending = false;
    session.emailOtpRequired = false;
    session.authenticatedWithMfa = true;
    session.emailOtpHash = null;
    session.emailOtpExpiresAt = null;
    await session.save();

    await createAuditLog({
      userId: user._id,
      username: user.username,
      role: user.role?.name || "Unknown",
      eventType: "EMAIL_MFA_ENABLED",
      action: "User enabled email OTP sign-in verification",
      result: "success",
      ipAddress: req.ip,
      userAgent: req.get("user-agent")
    });
    return res.status(200).json({ success: true, message: "Email sign-in verification is enabled." });
  } catch (error) {
    console.error("Email factor verification error:", error.message);
    return res.status(400).json({ success: false, message: error.message || "Email verification failed" });
  }
};

const disableEmailFactor = async (req, res) => {
  try {
    await verifyPasswordAndTotp(req.user._id, req.body.password, req.body.totpCode);
    const user = await User.findById(req.user._id).populate("role");
    if (!user || !user.emailOtpEnabled) {
      return res.status(400).json({ success: false, message: "Email sign-in verification is not enabled" });
    }
    user.emailOtpEnabled = false;
    await user.save();
    await createAuditLog({
      userId: user._id,
      username: user.username,
      role: user.role?.name || "Unknown",
      eventType: "EMAIL_MFA_DISABLED",
      action: "User disabled email OTP sign-in verification",
      result: "success",
      ipAddress: req.ip,
      userAgent: req.get("user-agent")
    });
    return res.status(200).json({ success: true, message: "Email sign-in verification is disabled." });
  } catch (error) {
    console.error("Email factor disable error:", error.message);
    return res.status(400).json({ success: false, message: error.message || "Unable to disable email verification" });
  }
};

const enrollMfa = async (req, res) => {
  try {
    const result = await createMfaEnrollment(req.user);

    let qrCodeDataUrl = null;
    try {
      qrCodeDataUrl = await QRCode.toDataURL(result.otpAuthUrl);
    } catch (qrErr) {
      console.warn("QR code generation warning:", qrErr.message);
    }

    return res.status(201).json({
      success: true,
      message: "MFA enrollment created. Scan QR code or enter secret key into your authenticator app.",
      otpAuthUrl: result.otpAuthUrl,
      secret: result.secret,
      qrCode: qrCodeDataUrl
    });

  } catch (error) {
    console.error("MFA enrollment error:", error.message);

    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

const verifyMfa = async (req, res) => {
  try {
    const { otpCode } = req.body;

    if (!otpCode) {
      return res.status(400).json({
        success: false,
        message: "OTP code is required"
      });
    }

    const result = await verifyMfaEnrollment(
      req.user._id,
      otpCode.trim()
    );

    req.session.authenticatedWithMfa = true;
    req.session.mfaSetupRequired = false;
    await req.session.save();

    await createAuditLog({
      userId: req.user._id,
      username: req.user.username,
      role: req.user.role?.name || "Unknown",
      eventType: "MFA_ENROLLED",
      action: "User successfully enrolled and verified MFA",
      result: "success",
      ipAddress: req.ip,
      userAgent: req.get("user-agent")
    });

    return res.status(200).json({
      success: true,
      message: "MFA enabled and verified successfully",
      verified: result.verified
    });

  } catch (error) {
    console.error("MFA verification error:", error.message);

    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

const disableMfa = async (req, res) => {
  try {
    const mfaMethod = await MfaMethod.findOne({
      user: req.user._id,
      type: "TOTP"
    });

    if (!mfaMethod || !mfaMethod.enabled) {
      return res.status(400).json({
        success: false,
        message: "MFA is not enabled for this account"
      });
    }

    mfaMethod.enabled = false;
    mfaMethod.verified = false;
    await mfaMethod.save();

    await createAuditLog({
      userId: req.user._id,
      username: req.user.username,
      role: req.user.role?.name || "Unknown",
      eventType: "MFA_DISABLED",
      action: "User disabled MFA",
      result: "success",
      ipAddress: req.ip,
      userAgent: req.get("user-agent")
    });

    return res.status(200).json({
      success: true,
      message: "MFA disabled successfully"
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export {
  getMfaStatus,
  enrollEmailFactor,
  verifyEmailFactor,
  disableEmailFactor,
  enrollMfa,
  verifyMfa,
  disableMfa
};