import Session from "../models/Session.js";
import User from "../models/User.js";
import { hashSessionToken } from "../services/authService.js";

const authenticateMfaSession = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    let token = req.cookies?.authToken || req.body?.sessionToken;

    if (!token && authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7).trim();
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "MFA login session required"
      });
    }

    const sessionTokenHash = hashSessionToken(token);

    const session = await Session.findOne({
      sessionTokenHash
    }).select("+emailOtpHash");

    if (!session) {
      return res.status(401).json({
        success: false,
        message: "Invalid MFA login session"
      });
    }

    if (session.revokedAt) {
      return res.status(401).json({
        success: false,
        message: "MFA login session revoked"
      });
    }

    if (session.expiresAt <= new Date()) {
      return res.status(401).json({
        success: false,
        message: "MFA login session expired"
      });
    }

    if (session.authenticatedWithMfa) {
      return res.status(400).json({
        success: false,
        message: "MFA has already been completed"
      });
    }

    const user = await User.findById(session.user)
      .populate("role");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found"
      });
    }

    req.user = user;
    req.session = session;

    next();

  } catch (error) {
    console.error(
      "MFA session middleware error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "MFA session validation failed"
    });
  }
};

export default authenticateMfaSession;