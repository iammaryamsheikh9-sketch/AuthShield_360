import crypto from "crypto";
import nodemailer from "nodemailer";
import EmailVerification from "../models/EmailVerification.js";
import User from "../models/User.js";

const TOKEN_TTL_MS = 30 * 60 * 1000;
const LOGIN_OTP_TTL_MS = 5 * 60 * 1000;

const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

const getVerificationUrl = (token) => {
  const clientUrl = (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${clientUrl}/?verify=${encodeURIComponent(token)}`;
};

const sendVerificationEmail = async (user) => {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  await EmailVerification.deleteMany({ user: user._id });
  await EmailVerification.create({ user: user._id, tokenHash: hashToken(token), expiresAt });

  const verificationUrl = getVerificationUrl(token);
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM } = process.env;
  const hasSmtpConfig = SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS && EMAIL_FROM;

  if (!hasSmtpConfig) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Email delivery is not configured");
    }
    console.info(`[development email] Verification link for ${user.email}: ${verificationUrl}`);
    return verificationUrl;
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });

  await transporter.sendMail({
    from: EMAIL_FROM,
    to: user.email,
    subject: "Verify your AuthShield 360 email",
    text: `Verify your email address using this link: ${verificationUrl}\nThis link expires in 30 minutes.`,
    html: `<p>Verify your AuthShield 360 email address:</p><p><a href="${verificationUrl}">Verify email address</a></p><p>This link expires in 30 minutes.</p>`
  });
  return null;
};

const sendLoginEmailOtp = async (user, session) => {
  const otp = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  const expiresAt = new Date(Date.now() + LOGIN_OTP_TTL_MS);
  session.emailOtpHash = hashToken(otp);
  session.emailOtpExpiresAt = expiresAt;
  session.emailOtpAttempts = 0;
  session.emailOtpRequired = true;
  await session.save();

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM } = process.env;
  const hasSmtpConfig = SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS && EMAIL_FROM;
  if (!hasSmtpConfig) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Email delivery is not configured");
    }
    console.info(`[development email] Sign-in code for ${user.email}: ${otp}`);
    return otp;
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
  await transporter.sendMail({
    from: EMAIL_FROM,
    to: user.email,
    subject: "Your AuthShield 360 sign-in code",
    text: `Your sign-in code is ${otp}. It expires in 5 minutes.`,
    html: `<p>Your AuthShield 360 sign-in code is:</p><p><strong>${otp}</strong></p><p>It expires in 5 minutes.</p>`
  });
  return null;
};

const verifyEmailToken = async (token) => {
  if (!token || typeof token !== "string" || token.length > 256) {
    throw new Error("Invalid or expired verification link");
  }

  const verification = await EmailVerification.findOne({ tokenHash: hashToken(token) });
  if (!verification || new Date(verification.expiresAt) <= new Date()) {
    throw new Error("Invalid or expired verification link");
  }

  const user = await User.findById(verification.user);
  if (!user) throw new Error("Verification account not found");

  user.emailVerified = true;
  user.emailVerifiedAt = new Date();
  await user.save();
  await EmailVerification.deleteMany({ user: user._id });
  return user;
};

export { sendVerificationEmail, sendLoginEmailOtp, verifyEmailToken };