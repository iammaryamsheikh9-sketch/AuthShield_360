import MfaMethod from "../models/MfaMethod.js";
import Session from "../models/Session.js";
import User from "../models/User.js";
import { hashSessionToken } from "../services/authService.js";
import getAuthPhase from "../config/authPhase.js";

const authenticateUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    let token = req.cookies?.authToken;

    if (!token && authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7).trim();
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authentication required"
      });
    }

    const sessionTokenHash = hashSessionToken(token);

    const session = await Session.findOne({
      sessionTokenHash
    }).select("+sessionTokenHash");

    if (!session) {
      return res.status(401).json({
        success: false,
        message: "Invalid session"
      });
    }

    if (session.revokedAt) {
      return res.status(401).json({
        success: false,
        message: "Session has been revoked"
      });
    }

    if (session.expiresAt <= new Date()) {
      await Session.findByIdAndUpdate(session._id, {
        revokedAt: new Date()
      });

      return res.status(401).json({
        success: false,
        message: "Session has expired"
      });
    }

    const user = await User.findById(session.user)
      .populate("role");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User account not found"
      });
    }

    if (user.status === "disabled") {
      return res.status(403).json({
        success: false,
        message: "Account is disabled"
      });
    }

    const mfaMethod = await MfaMethod.findOne({
      user: user._id,
      type: "TOTP",
      enabled: true,
      verified: true
    });

    const authPhase = getAuthPhase();
    const requestPath = req.originalUrl.split("?")[0];
    const mfaSetupPaths = [
      "/api/mfa/status",
      "/api/mfa/enroll",
      "/api/mfa/verify",
      "/api/auth/logout"
    ];

    if (authPhase === 3 && !user.emailVerified) {
      return res.status(403).json({
        success: false,
        message: "Email verification required"
      });
    }

    if (authPhase >= 2 && !mfaMethod && !mfaSetupPaths.includes(requestPath)) {
      return res.status(403).json({
        success: false,
        message: "MFA setup required"
      });
    }

    if ((mfaMethod || user.emailOtpEnabled || authPhase === 3) && !session.authenticatedWithMfa) {
      return res.status(403).json({
        success: false,
        message: "MFA verification required"
      });
    }

    req.user = user;
    req.session = session;

    next();

  } catch (error) {
    console.error("Authentication middleware error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Authentication check failed"
    });
  }
};

export default authenticateUser;