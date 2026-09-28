import crypto from "crypto";
import { generateSecret, generateURI, verify } from "otplib";

import MfaMethod from "../models/MfaMethod.js";

const getEncryptionKey = () => {
  const configuredKey = process.env.MFA_ENCRYPTION_KEY;
  if (process.env.NODE_ENV === "production" && !configuredKey) {
    throw new Error("MFA_ENCRYPTION_KEY must be configured in production");
  }
  const key = configuredKey || "authshield360_secure_mfa_encryption_key_2026_default";
  return crypto.createHash("sha256").update(key).digest();
};

const encryptSecret = (secret) => {
  const iv = crypto.randomBytes(16);

  const cipher = crypto.createCipheriv(
    "aes-256-cbc",
    getEncryptionKey(),
    iv
  );

  let encrypted = cipher.update(secret, "utf8", "hex");

  encrypted += cipher.final("hex");

  return `${iv.toString("hex")}:${encrypted}`;
};

const decryptSecret = (encryptedSecret) => {
  const [ivHex, encrypted] = encryptedSecret.split(":");

  const iv = Buffer.from(ivHex, "hex");

  const decipher = crypto.createDecipheriv(
    "aes-256-cbc",
    getEncryptionKey(),
    iv
  );

  let decrypted = decipher.update(
    encrypted,
    "hex",
    "utf8"
  );

  decrypted += decipher.final("utf8");

  return decrypted;
};

const createMfaEnrollment = async (user) => {
  const existingMfa = await MfaMethod.findOne({
    user: user._id,
    type: "TOTP"
  });

  if (existingMfa && existingMfa.verified) {
    throw new Error("MFA is already enrolled");
  }

  const secret = generateSecret();

  const serviceName = "AuthShield 360";
  const accountName = user.email;

  const otpAuthUrl = generateURI({
    label: accountName,
    issuer: serviceName,
    secret
  });

  const secretEncrypted = encryptSecret(secret);

  if (existingMfa) {
    existingMfa.secretEncrypted = secretEncrypted;
    existingMfa.enabled = false;
    existingMfa.verified = false;
    existingMfa.enrolledAt = new Date();

    await existingMfa.save();
  } else {
    await MfaMethod.create({
      user: user._id,
      type: "TOTP",
      secretEncrypted,
      enabled: false,
      verified: false,
      enrolledAt: new Date()
    });
  }

  return {
    secret,
    otpAuthUrl
  };
};

const verifyMfaEnrollment = async (userId, otpCode) => {
  const mfaMethod = await MfaMethod
    .findOne({
      user: userId,
      type: "TOTP"
    })
    .select("+secretEncrypted");

  if (!mfaMethod) {
    throw new Error("MFA enrollment not found");
  }

  const secret = decryptSecret(
    mfaMethod.secretEncrypted
  );

  const verification = await verify({
    token: otpCode,
    secret
  });
  const isValid = verification.valid;

  if (!isValid) {
    throw new Error("Invalid MFA code");
  }

  mfaMethod.verified = true;
  mfaMethod.enabled = true;
  mfaMethod.lastUsedAt = new Date();

  await mfaMethod.save();

  return {
    verified: true
  };
};

const verifyUserMfaCode = async (userId, otpCode) => {
  if (typeof otpCode !== "string" || !/^\d{6}$/.test(otpCode)) {
    throw new Error("Enter a valid 6-digit authenticator code");
  }

  const mfaMethod = await MfaMethod.findOne({
    user: userId,
    type: "TOTP",
    enabled: true,
    verified: true
  }).select("+secretEncrypted");

  if (!mfaMethod) throw new Error("An enabled authenticator was not found");

  const verification = await verify({
    token: otpCode,
    secret: decryptSecret(mfaMethod.secretEncrypted)
  });
  if (!verification.valid) throw new Error("Invalid authenticator code");

  mfaMethod.lastUsedAt = new Date();
  await mfaMethod.save();
};

export {
  createMfaEnrollment,
  verifyMfaEnrollment,
  verifyUserMfaCode,
  encryptSecret as encryptMfaSecret,
  decryptSecret as decryptMfaSecret
};