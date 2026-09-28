import express from "express";
import authenticateUser from "../middleware/authMiddleware.js";
import {
  requireRole,
  requirePermission
} from "../middleware/roleMiddleware.js";

const router = express.Router();

router.get(
  "/profile",
  authenticateUser,
  (req, res) => {
    res.status(200).json({
      success: true,
      message: "You are authenticated",
      user: {
        id: req.user._id,
        username: req.user.username,
        email: req.user.email,
        role: req.user.role?.name,
        status: req.user.status
      },
      session: {
        id: req.session._id,
        expiresAt: req.session.expiresAt
      }
    });
  }
);

router.get(
  "/admin-test",
  authenticateUser,
  requireRole("Administrator"),
  (req, res) => {
    res.status(200).json({
      success: true,
      message: "Administrator access granted"
    });
  }
);

router.get(
  "/student-test",
  authenticateUser,
  requireRole("Student"),
  (req, res) => {
    res.status(200).json({
      success: true,
      message: "Student access granted"
    });
  }
);

router.get(
  "/assignment",
  authenticateUser,
  requirePermission("assignment:read"),
  (req, res) => {
    res.status(200).json({
      success: true,
      message: "Assignment access granted"
    });
  }
);

export default router;