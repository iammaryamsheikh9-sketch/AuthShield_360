import bcrypt from "bcryptjs";
import User from "../models/User.js";
import Role from "../models/Role.js";
import Student from "../models/Student.js";
import PasswordCredential from "../models/PasswordCredential.js";
import { loginUser, verifyMfaLogin, verifyLoginEmailOtp, logoutUser } from "../services/authService.js";
import getAuthPhase from "../config/authPhase.js";
import { sendVerificationEmail, verifyEmailToken } from "../services/emailVerificationService.js";
import createAuditLog from "../services/auditService.js";

const getAuthConfig = (req, res) => {
  const phase = getAuthPhase();
  return res.status(200).json({
    success: true,
    phase,
    passwordHashing: true,
    totpRequired: phase >= 2,
    emailVerificationRequired: phase === 3
  });
};

const registerUser = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Username, email and password are required"
      });
    }

    if (typeof username !== "string" || username.trim().length < 3 || username.trim().length > 50) {
      return res.status(400).json({ success: false, message: "Username must be between 3 and 50 characters" });
    }
    if (typeof password !== "string" || password.length < 12 || Buffer.byteLength(password, "utf8") > 72) {
      return res.status(400).json({ success: false, message: "Password must be at least 12 characters and no more than 72 UTF-8 bytes" });
    }
    if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ success: false, message: "A valid email address is required" });
    }

    const normalizedUsername = username.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await User.findOne({
      $or: [
        { username: normalizedUsername },
        { email: normalizedEmail }
      ]
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Username or email already exists"
      });
    }

    const selectedRole = await Role.findOne({ name: "Student" });

    if (!selectedRole) {
      return res.status(400).json({
        success: false,
        message: "Student role is not configured"
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const authPhase = getAuthPhase();
    const user = await User.create({
      username,
      email: normalizedEmail,
      role: selectedRole._id,
      status: "active",
      emailVerified: authPhase < 3,
      emailVerifiedAt: authPhase < 3 ? new Date() : null
    });

    await PasswordCredential.create({
      user: user._id,
      passwordHash
    });

    const randomNum = Math.floor(1000 + Math.random() * 9000);
    await Student.create({
      user: user._id,
      studentId: `STU-${randomNum}`,
      firstName: normalizedUsername.charAt(0).toUpperCase() + normalizedUsername.slice(1),
      lastName: "User",
      className: "Cybersecurity 101",
      enrollmentYear: new Date().getFullYear(),
      status: "active"
    });

    let developmentVerificationUrl = null;
    if (authPhase === 3) {
      developmentVerificationUrl = await sendVerificationEmail(user);
    }

    const userResponse = {
      id: user._id,
      username: user.username,
      email: user.email,
      role: selectedRole.name,
      status: user.status,
      emailVerified: user.emailVerified
    };

    return res.status(201).json({
      success: true,
      message: authPhase === 3 ? "Account created. Verify your email before signing in." : "User registered successfully",
      user: userResponse,
      authPhase,
      emailVerificationRequired: authPhase === 3,
      ...(developmentVerificationUrl ? { developmentVerificationUrl } : {})
    });

  } catch (error) {
    console.error("Registration error:", error.message);

    return res.status(500).json({
      success: false,
      message: error.message || "Unable to register user"
    });
  }
};

const resendEmailVerification = async (req, res) => {
  try {
    if (getAuthPhase() !== 3) {
      return res.status(200).json({ success: true, message: "Email verification is not required in this phase." });
    }

    const email = String(req.body.email || "").trim().toLowerCase();
    const user = email ? await User.findOne({ email }) : null;
    let developmentVerificationUrl = null;
    if (user && !user.emailVerified) {
      developmentVerificationUrl = await sendVerificationEmail(user);
    }

    return res.status(200).json({
      success: true,
      message: "If this account needs verification, a new link has been sent.",
      ...(developmentVerificationUrl ? { developmentVerificationUrl } : {})
    });
  } catch (error) {
    return res.status(503).json({ success: false, message: "Verification email could not be sent. Try again later." });
  }
};

const verifyEmail = async (req, res) => {
  try {
    const user = await verifyEmailToken(req.body.token);
    const populatedUser = await User.findById(user._id).populate("role");
    await createAuditLog({
      userId: user._id,
      username: user.username,
      role: populatedUser.role?.name || "Unknown",
      eventType: "EMAIL_VERIFIED",
      action: "User verified their email address",
      result: "success",
      ipAddress: req.ip,
      userAgent: req.get("user-agent")
    });
    return res.status(200).json({ success: true, message: "Email verified. You can now sign in." });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message || "Invalid or expired verification link" });
  }
};

const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Username and password are required"
      });
    }

    const result = await loginUser({
      username,
      password,
      ipAddress: req.ip,
      userAgent: req.get("user-agent")
    });

    res.cookie("authToken", result.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      expires: result.expiresAt
    });

    if (result.requiresMfa) {
      return res.status(200).json({
        success: true,
        requiresMfa: true,
        message: "MFA verification required",
        sessionToken: result.sessionToken,
        sessionId: result.sessionId,
        user: result.user
      });
    }
    if (result.requiresMfaSetup) {
      return res.status(200).json({
        success: true,
        requiresMfaSetup: true,
        message: "Set up an authenticator app to continue",
        sessionToken: result.sessionToken,
        sessionId: result.sessionId,
        user: result.user,
        authPhase: result.authPhase
      });
    }
    if (result.requiresEmailOtp) {
      return res.status(200).json({
        success: true,
        requiresMfa: false,
        requiresEmailOtp: true,
        message: "A sign-in code was sent to your verified email address.",
        ...(result.developmentOtp ? { developmentOtp: result.developmentOtp } : {}),
        sessionToken: result.sessionToken,
        sessionId: result.sessionId,
        user: result.user
      });
    }

    return res.status(200).json({
      success: true,
      requiresMfa: false,
      message: "Login successful",
      sessionToken: result.sessionToken,
      sessionId: result.sessionId,
      user: result.user,
      expiresAt: result.expiresAt
    });

  } catch (error) {
    console.error("Login error:", error.message);

    return res.status(401).json({
      success: false,
      message: error.message
    });
  }
};

const verifyLoginMfa = async (req, res) => {
  try {
    const { otpCode } = req.body;

    if (!otpCode) {
      return res.status(400).json({
        success: false,
        message: "OTP code is required"
      });
    }

    const result = await verifyMfaLogin({
      sessionId: req.session._id,
      userId: req.user._id,
      otpCode: otpCode.trim(),
      ipAddress: req.ip,
      userAgent: req.get("user-agent")
    });

    if (result.requiresEmailOtp) {
      return res.status(200).json({
        success: true,
        requiresEmailOtp: true,
        message: "Authenticator verified. A time-limited email code has been sent.",
        ...(result.developmentOtp ? { developmentOtp: result.developmentOtp } : {})
      });
    }

    return res.status(200).json({
      success: true,
      message: "MFA login verified successfully",
      user: result.user,
      sessionToken: req.cookies?.authToken || (req.headers.authorization && req.headers.authorization.split(" ")[1])
    });

  } catch (error) {
    console.error("MFA Login verification error:", error.message);

    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

const verifyLoginEmailCode = async (req, res) => {
  try {
    const { otpCode } = req.body;
    if (!otpCode) {
      return res.status(400).json({ success: false, message: "Email code is required" });
    }

    const result = await verifyLoginEmailOtp({
      sessionId: req.session._id,
      userId: req.user._id,
      otpCode: String(otpCode).trim(),
      ipAddress: req.ip,
      userAgent: req.get("user-agent")
    });

    return res.status(200).json({
      success: true,
      message: "Email verification complete. Sign-in successful.",
      user: result.user
    });
  } catch (error) {
    console.error("Email OTP login verification error:", error.message);
    return res.status(400).json({ success: false, message: error.message || "Email code verification failed" });
  }
};

const logout = async (req, res) => {
  try {
    await logoutUser({
      sessionId: req.session._id,
      userId: req.user._id,
      ipAddress: req.ip,
      userAgent: req.get("user-agent")
    });

    res.clearCookie("authToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax"
    });

    return res.status(200).json({
      success: true,
      message: "Logout successful"
    });

  } catch (error) {
    console.error("Logout error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Logout failed"
    });
  }
};

export {
  getAuthConfig,
  registerUser,
  resendEmailVerification,
  verifyEmail,
  login,
  verifyLoginMfa,
  verifyLoginEmailCode,
  logout
};