import express from "express";
import authenticateUser from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";
import {
  getAllUsers,
  updateUserStatus,
  updateUserRole,
  getAuditLogs,
  getSecurityTests,
  recordSecurityTestResult
} from "../controllers/adminController.js";

const router = express.Router();

// All admin routes require Administrator role
router.use(authenticateUser, requireRole("Administrator"));

router.get("/users", getAllUsers);
router.post("/users/status", updateUserStatus);
router.post("/users/role", updateUserRole);
router.get("/audit-logs", getAuditLogs);
router.get("/security-tests", getSecurityTests);
router.post("/security-tests", recordSecurityTestResult);

export default router;
