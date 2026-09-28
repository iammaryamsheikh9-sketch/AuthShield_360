import bcrypt from "bcryptjs";
import crypto from "crypto";
import { verify } from "otplib";

import createAuditLog from "./auditService.js";

import User from "../models/User.js";
import PasswordCredential from "../models/PasswordCredential.js";
import Session from "../models/Session.js";
import LoginAttempt from "../models/LoginAttempt.js";
import MfaMethod from "../models/MfaMethod.js";
import getAuthPhase from "../config/authPhase.js";
import { decryptMfaSecret } from "./mfaService.js";
import { sendLoginEmailOtp } from "./emailVerificationService.js";

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_TIME_MINUTES = 15;
const SESSION_DAYS = 7;

const createSessionToken = () => {
  return crypto.randomBytes(48).toString("hex");
};

const hashSessionToken = (token) => {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
};

const createSession = async ({
  userId,
  sessionToken,
  ipAddress,
  userAgent,
  authenticatedWithMfa,
  mfaSetupRequired = false
}) => {
  const sessionTokenHash = hashSessionToken(sessionToken);

  const expiresAt = new Date(
    Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000
  );

  const session = await Session.create({
    user: userId,
    sessionTokenHash,
    ipAddress,
    userAgent,
    authenticatedWithMfa,
    mfaSetupRequired,
    expiresAt
  });

  return {
    session,
    expiresAt
  };
};

const loginUser = async ({
  username,
  password,
  ipAddress,
  userAgent
}) => {
  const startedAt = Date.now();

  const user = await User.findOne({
    username
  }).populate("role");

  // User does not exist
  if (!user) {
    await LoginAttempt.create({
      username,
      authenticationMode: "password-only",
      factor: "password",
      result: "failure",
      failureReason: "unknown_user",
      ipAddress,
      userAgent,
      durationMs: Date.now() - startedAt,
      startedAt: new Date(startedAt),
      completedAt: new Date()
    });

    await createAuditLog({
      username,
      role: "Unknown",
      eventType: "LOGIN_FAILURE",
      action: "Login failed because the username was not found",
      result: "failure",
      ipAddress,
      userAgent,
      metadata: {
        reason: "unknown_user"
      }
    });

    throw new Error("Invalid username or password");
  }

  // Disabled account
  if (user.status === "disabled") {
    await LoginAttempt.create({
      user: user._id,
      username,
      authenticationMode: "password-only",
      factor: "password",
      result: "failure",
      failureReason: "account_disabled",
      ipAddress,
      userAgent,
      durationMs: Date.now() - startedAt,
      startedAt: new Date(startedAt),
      completedAt: new Date()
    });

    await createAuditLog({
      userId: user._id,
      username: user.username,
      role: user.role?.name || "Unknown",
      eventType: "LOGIN_FAILURE",
      action: "Login rejected because the account is disabled",
      result: "failure",
      ipAddress,
      userAgent,
      metadata: {
        reason: "account_disabled"
      }
    });

    throw new Error("Account is disabled");
  }

  const credential = await PasswordCredential
    .findOne({
      user: user._id
    })
    .select("+passwordHash +failedAttempts +lockedUntil");

  if (!credential) {
    await createAuditLog({
      userId: user._id,
      username: user.username,
      role: user.role?.name || "Unknown",
      eventType: "LOGIN_FAILURE",
      action: "Login failed because password credential was not found",
      result: "failure",
      ipAddress,
      userAgent,
      metadata: {
        reason: "password_credential_not_found"
      }
    });

    throw new Error("Password credential not found");
  }

  // Check temporary lock
  if (
    credential.lockedUntil &&
    credential.lockedUntil > new Date()
  ) {
    await LoginAttempt.create({
      user: user._id,
      username,
      authenticationMode: "password-only",
      factor: "password",
      result: "failure",
      failureReason: "account_locked",
      ipAddress,
      userAgent,
      durationMs: Date.now() - startedAt,
      startedAt: new Date(startedAt),
      completedAt: new Date()
    });

    await createAuditLog({
      userId: user._id,
      username: user.username,
      role: user.role?.name || "Unknown",
      eventType: "LOGIN_FAILURE",
      action: "Login rejected because the account is temporarily locked",
      result: "failure",
      ipAddress,
      userAgent,
      metadata: {
        reason: "account_locked",
        lockedUntil: credential.lockedUntil
      }
    });

    throw new Error("Account is temporarily locked");
  }

  const passwordMatched = await bcrypt.compare(
    password,
    credential.passwordHash
  );

  // Wrong password
  if (!passwordMatched) {
    credential.failedAttempts += 1;

    let failureReason = "invalid_password";

    if (credential.failedAttempts >= MAX_LOGIN_ATTEMPTS) {
      credential.lockedUntil = new Date(
        Date.now() +
        LOCK_TIME_MINUTES * 60 * 1000
      );

      user.status = "locked";

      await user.save();

      failureReason = "account_locked";

      await createAuditLog({
        userId: user._id,
        username: user.username,
        role: user.role?.name || "Unknown",
        eventType: "ACCOUNT_LOCKED",
        action: "Account locked after repeated failed login attempts",
        result: "failure",
        ipAddress,
        userAgent,
        metadata: {
          failedAttempts: credential.failedAttempts,
          lockDurationMinutes: LOCK_TIME_MINUTES
        }
      });
    } else {
      await createAuditLog({
        userId: user._id,
        username: user.username,
        role: user.role?.name || "Unknown",
        eventType: "LOGIN_FAILURE",
        action: "Login failed because of an invalid password",
        result: "failure",
        ipAddress,
        userAgent,
        metadata: {
          failedAttempts: credential.failedAttempts,
          remainingAttempts:
            MAX_LOGIN_ATTEMPTS - credential.failedAttempts
        }
      });
    }

    await credential.save();

    await LoginAttempt.create({
      user: user._id,
      username,
      authenticationMode: "password-only",
      factor: "password",
      result: "failure",
      failureReason,
      ipAddress,
      userAgent,
      durationMs: Date.now() - startedAt,
      startedAt: new Date(startedAt),
      completedAt: new Date()
    });

    throw new Error("Invalid username or password");
  }

  // Password is correct, reset failed attempts
  credential.failedAttempts = 0;
  credential.lockedUntil = null;

  await credential.save();

  const mfaMethod = await MfaMethod.findOne({
    user: user._id,
    type: "TOTP",
    enabled: true,
    verified: true
  });

  const authPhase = getAuthPhase();

  if (authPhase === 3 && !user.emailVerified) {
    await createAuditLog({
      userId: user._id,
      username: user.username,
      role: user.role?.name || "Unknown",
      eventType: "LOGIN_FAILURE",
      action: "Login blocked because the email address is not verified",
      result: "failure",
      ipAddress,
      userAgent,
      metadata: { reason: "email_not_verified", authPhase }
    });
    throw new Error("Email verification required. Check your inbox or request another link.");
  }

  if (authPhase >= 2 && !mfaMethod) {
    const setupToken = createSessionToken();
    const setupSession = await createSession({
      userId: user._id,
      sessionToken: setupToken,
      ipAddress,
      userAgent,
      authenticatedWithMfa: false,
      mfaSetupRequired: true
    });

    return {
      requiresMfaSetup: true,
      sessionToken: setupToken,
      sessionId: setupSession.session._id,
      expiresAt: setupSession.expiresAt,
      authPhase,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role?.name,
        status: user.status
      }
    };
  }

  // A verified authenticator remains a required login factor once enrolled,
  // regardless of which authentication comparison phase is active.
  if (mfaMethod) {
    const temporaryToken = createSessionToken();

    const temporarySession = await createSession({
      userId: user._id,
      sessionToken: temporaryToken,
      ipAddress,
      userAgent,
      authenticatedWithMfa: false
    });

    await LoginAttempt.create({
      user: user._id,
      username,
      authenticationMode: "password+mfa",
      factor: "password",
      result: "success",
      failureReason: "none",
      ipAddress,
      userAgent,
      durationMs: Date.now() - startedAt,
      startedAt: new Date(startedAt),
      completedAt: new Date()
    });

    await createAuditLog({
      userId: user._id,
      username: user.username,
      role: user.role?.name || "Unknown",
      eventType: "LOGIN_SUCCESS",
      action: "Password verified and MFA verification is required",
      result: "success",
      ipAddress,
      userAgent,
      sessionId: temporarySession.session._id.toString(),
      metadata: {
        authenticationStage: "password",
        mfaRequired: true
      }
    });

    return {
      requiresMfa: true,
      requiresEmailOtp: authPhase === 3 || user.emailOtpEnabled === true,
      sessionToken: temporaryToken,
      sessionId: temporarySession.session._id,
      expiresAt: temporarySession.expiresAt,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role?.name,
        status: user.status
      }
    };
  }

  if (user.emailOtpEnabled || authPhase === 3) {
    const sessionToken = createSessionToken();
    const sessionData = await createSession({
      userId: user._id,
      sessionToken,
      ipAddress,
      userAgent,
      authenticatedWithMfa: false
    });
    const developmentOtp = await sendLoginEmailOtp(user, sessionData.session);

    return {
      requiresMfa: false,
      requiresEmailOtp: true,
      developmentOtp,
      sessionToken,
      sessionId: sessionData.session._id,
      expiresAt: sessionData.expiresAt,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role?.name,
        status: user.status
      }
    };
  }

  // Normal password-only login
  user.lastLoginAt = new Date();

  if (user.status === "locked") {
    user.status = "active";
  }

  await user.save();

  const sessionToken = createSessionToken();

  const sessionData = await createSession({
    userId: user._id,
    sessionToken,
    ipAddress,
    userAgent,
    authenticatedWithMfa: false
  });

  await LoginAttempt.create({
    user: user._id,
    username,
    authenticationMode: "password-only",
    factor: "password",
    result: "success",
    failureReason: "none",
    ipAddress,
    userAgent,
    durationMs: Date.now() - startedAt,
    startedAt: new Date(startedAt),
    completedAt: new Date()
  });

  await createAuditLog({
    userId: user._id,
    username: user.username,
    role: user.role?.name || "Unknown",
    eventType: "LOGIN_SUCCESS",
    action: "User logged in successfully with password",
    result: "success",
    ipAddress,
    userAgent,
    sessionId: sessionData.session._id.toString(),
    metadata: {
      authenticationMode: "password-only"
    }
  });

  return {
    requiresMfa: false,
    sessionToken,
    sessionId: sessionData.session._id,
    expiresAt: sessionData.expiresAt,
    user: {
      id: user._id,
      username: user.username,
      email: user.email,
      role: user.role?.name,
      status: user.status
    }
  };
};

const verifyMfaLogin = async ({
  sessionId,
  userId,
  otpCode,
  ipAddress,
  userAgent
}) => {
  const session = await Session.findOne({
    _id: sessionId,
    user: userId
  });

  if (!session) {
    throw new Error("Login session not found");
  }

  if (session.revokedAt) {
    throw new Error("Login session has been revoked");
  }

  if (session.expiresAt <= new Date()) {
    session.revokedAt = new Date();

    await session.save();

    throw new Error("Login session has expired");
  }

  if (session.authenticatedWithMfa) {
    throw new Error("MFA has already been verified");
  }

  const authPhase = getAuthPhase();
  if (session.emailOtpRequired && session.mfaVerifiedAt) {
    throw new Error("Authenticator verified. Complete the email code step or restart sign-in.");
  }

  const mfaMethod = await MfaMethod
    .findOne({
      user: userId,
      type: "TOTP",
      enabled: true,
      verified: true
    })
    .select("+secretEncrypted");

  if (!mfaMethod) {
    throw new Error("Active MFA method not found");
  }

  /*
   * MFA secret is encrypted before it is stored.
   * Here we decrypt it only for OTP verification.
   */

  const secret = decryptMfaSecret(mfaMethod.secretEncrypted);

  const verification = await verify({
    token: otpCode,
    secret
  });
  const isValid = verification.valid;

  // Wrong OTP
  if (!isValid) {
    const user = await User.findById(userId).populate("role");

    await LoginAttempt.create({
      user: userId,
      username: user?.username || "unknown",
      authenticationMode: "password+mfa",
      factor: "otp",
      result: "failure",
      failureReason: "invalid_otp",
      ipAddress,
      userAgent,
      startedAt: new Date(),
      completedAt: new Date()
    });

    await createAuditLog({
      userId,
      username: user?.username || "unknown",
      role: user?.role?.name || "Unknown",
      eventType: "MFA_FAILURE",
      action: "MFA verification failed because of an invalid OTP",
      result: "failure",
      ipAddress,
      userAgent,
      sessionId: session._id.toString(),
      metadata: {
        factor: "TOTP"
      }
    });

    throw new Error("Invalid MFA code");
  }

  session.authenticatedWithMfa = false;
  session.mfaSetupRequired = false;
  session.mfaVerifiedAt = new Date();

  await session.save();

  mfaMethod.lastUsedAt = new Date();

  await mfaMethod.save();

  const user = await User.findById(userId)
    .populate("role");

  if (!user) {
    throw new Error("User account not found");
  }

  const requiresEmailOtp = authPhase === 3 || user.emailOtpEnabled === true;
  if (!requiresEmailOtp) {
    session.authenticatedWithMfa = true;
    await session.save();
    user.lastLoginAt = new Date();
    if (user.status === "locked") {
      user.status = "active";
    }
    await user.save();
  } else {
    const developmentOtp = await sendLoginEmailOtp(user, session);
    return {
      requiresEmailOtp: true,
      developmentOtp,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role?.name,
        status: user.status
      }
    };
  }

  await LoginAttempt.create({
    user: userId,
    username: user.username,
    authenticationMode: "password+mfa",
    factor: "otp",
    result: "success",
    failureReason: "none",
    ipAddress,
    userAgent,
    startedAt: new Date(),
    completedAt: new Date()
  });

  await createAuditLog({
    userId,
    username: user.username,
    role: user.role?.name || "Unknown",
    eventType: "MFA_SUCCESS",
    action: "User successfully completed MFA verification",
    result: "success",
    ipAddress,
    userAgent,
    sessionId: session._id.toString(),
    metadata: {
      factor: "TOTP"
    }
  });

  if (authPhase === 3) {
    const developmentOtp = await sendLoginEmailOtp(user, session);
    return {
      requiresEmailOtp: true,
      developmentOtp,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role?.name,
        status: user.status
      }
    };
  }

  await createAuditLog({
    userId,
    username: user.username,
    role: user.role?.name || "Unknown",
    eventType: "LOGIN_SUCCESS",
    action: "User completed MFA login successfully",
    result: "success",
    ipAddress,
    userAgent,
    sessionId: session._id.toString(),
    metadata: {
      authenticationMode: "password+mfa"
    }
  });

  return {
    session,
    user: {
      id: user._id,
      username: user.username,
      email: user.email,
      role: user.role?.name,
      status: user.status
    }
  };
};

const verifyLoginEmailOtp = async ({ sessionId, userId, otpCode, ipAddress, userAgent }) => {
  const session = await Session.findOne({ _id: sessionId, user: userId }).select("+emailOtpHash");
  if (!session || session.revokedAt || session.expiresAt <= new Date()) {
    throw new Error("Login session is invalid or expired. Restart sign-in.");
  }
  const user = await User.findById(userId).populate("role");
  if (!user) throw new Error("User account not found");
  if ((!user.emailOtpEnabled && getAuthPhase() !== 3) || !session.emailOtpRequired || session.authenticatedWithMfa || !session.emailOtpHash) {
    throw new Error("Email verification is not pending for this sign-in");
  }

  if (user.emailOtpEnabled) {
    const mfaMethod = await MfaMethod.findOne({
      user: userId,
      type: "TOTP",
      enabled: true,
      verified: true
    });
    if (mfaMethod && !session.mfaVerifiedAt) {
      throw new Error("Complete the authenticator step before entering an email code");
    }
  } else if (getAuthPhase() === 3 && !session.mfaVerifiedAt) {
    throw new Error("Complete the authenticator step before entering an email code");
  }

  const now = new Date();
  const recordAttempt = async (failureReason) => {
    await LoginAttempt.create({
      user: userId,
      username: user.username,
      authenticationMode: "password+mfa+email",
      factor: "email_otp",
      result: "failure",
      failureReason,
      ipAddress,
      userAgent,
      startedAt: now,
      completedAt: now
    });
    await createAuditLog({
      userId,
      username: user.username,
      role: user.role?.name || "Unknown",
      eventType: "MFA_FAILURE",
      action: failureReason === "expired_otp" ? "Email OTP expired" : "Email OTP verification failed",
      result: "failure",
      ipAddress,
      userAgent,
      sessionId: session._id.toString(),
      metadata: { factor: "email_otp", reason: failureReason }
    });
  };

  if (!session.emailOtpExpiresAt || new Date(session.emailOtpExpiresAt) <= now) {
    session.revokedAt = now;
    session.emailOtpHash = null;
    await session.save();
    await recordAttempt("expired_otp");
    throw new Error("Email code expired. Restart sign-in to request a new code.");
  }

  if (session.emailOtpAttempts >= 5) {
    session.revokedAt = now;
    await session.save();
    throw new Error("Too many incorrect email codes. Restart sign-in.");
  }

  const providedHash = crypto.createHash("sha256").update(String(otpCode)).digest();
  const storedHash = Buffer.from(session.emailOtpHash, "hex");
  const isValid = /^\d{6}$/.test(String(otpCode)) && storedHash.length === providedHash.length && crypto.timingSafeEqual(storedHash, providedHash);

  if (!isValid) {
    session.emailOtpAttempts += 1;
    if (session.emailOtpAttempts >= 5) session.revokedAt = now;
    await session.save();
    await recordAttempt("invalid_otp");
    throw new Error(session.revokedAt ? "Too many incorrect email codes. Restart sign-in." : "Invalid email code");
  }

  session.authenticatedWithMfa = true;
  session.emailOtpRequired = false;
  session.emailOtpHash = null;
  session.emailOtpExpiresAt = null;
  await session.save();

  user.lastLoginAt = now;
  if (user.status === "locked") user.status = "active";
  await user.save();

  await LoginAttempt.create({
    user: userId,
    username: user.username,
    authenticationMode: "password+mfa+email",
    factor: "email_otp",
    result: "success",
    failureReason: "none",
    ipAddress,
    userAgent,
    startedAt: now,
    completedAt: now
  });
  await createAuditLog({
    userId,
    username: user.username,
    role: user.role?.name || "Unknown",
    eventType: "MFA_SUCCESS",
    action: "User successfully completed email OTP step-up verification",
    result: "success",
    ipAddress,
    userAgent,
    sessionId: session._id.toString(),
    metadata: { factor: "email_otp" }
  });
  await createAuditLog({
    userId,
    username: user.username,
    role: user.role?.name || "Unknown",
    eventType: "LOGIN_SUCCESS",
    action: "User completed password, authenticator, and email OTP sign-in",
    result: "success",
    ipAddress,
    userAgent,
    sessionId: session._id.toString(),
    metadata: { authenticationMode: "password+mfa+email" }
  });

  return {
    session,
    user: {
      id: user._id,
      username: user.username,
      email: user.email,
      role: user.role?.name,
      status: user.status
    }
  };
};

const logoutUser = async ({
  sessionId,
  userId,
  ipAddress,
  userAgent
}) => {
  const session = await Session.findOne({
    _id: sessionId,
    user: userId
  });

  if (!session) {
    throw new Error("Session not found");
  }

  if (session.revokedAt) {
    return {
      message: "Session already revoked"
    };
  }

  session.revokedAt = new Date();

  await session.save();

  const user = await User.findById(userId)
    .populate("role");

  await createAuditLog({
    userId,
    username: user?.username || "unknown",
    role: user?.role?.name || "Unknown",
    eventType: "LOGOUT",
    action: "User logged out",
    result: "success",
    ipAddress,
    userAgent,
    sessionId: session._id.toString()
  });

  return {
    message: "Logout successful"
  };
};

export {
  loginUser,
  verifyMfaLogin,
  verifyLoginEmailOtp,
  logoutUser,
  hashSessionToken
};