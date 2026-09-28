import express from "express";
import rateLimit from "express-rate-limit";

import {
  getAuthConfig,
  registerUser,
  resendEmailVerification,
  verifyEmail,
  login,
  verifyLoginMfa,
  verifyLoginEmailCode,
  logout
} from "../controllers/authController.js";

import authenticateUser from "../middleware/authMiddleware.js";
import authenticateMfaSession from "../middleware/mfaLoginMiddleware.js";

const router = express.Router();
const emailVerificationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false
});

router.get("/config", getAuthConfig);
router.post("/verify-email", emailVerificationLimiter, verifyEmail);
router.post("/resend-verification", emailVerificationLimiter, resendEmailVerification);

router.post(
  "/register",
  registerUser
);

router.post(
  "/login",
  login
);

router.post(
  "/login/mfa",
  authenticateMfaSession,
  verifyLoginMfa
);

router.post(
  "/login/email-otp",
  authenticateMfaSession,
  verifyLoginEmailCode
);

router.post(
  "/logout",
  authenticateUser,
  logout
);

export default router;