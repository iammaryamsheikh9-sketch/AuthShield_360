import express from "express";
import authenticateUser from "../middleware/authMiddleware.js";
import { requireRole, requirePermission } from "../middleware/roleMiddleware.js";
import {
  getMyStudentProfile,
  getAcademicRecords,
  getAllStudents,
  createAcademicRecord,
  gradeAcademicRecord,
  getMyAttendance,
  getAttendanceForDate,
  markAttendanceBulk
} from "../controllers/studentController.js";

const router = express.Router();

// Student routes
router.get("/profile", authenticateUser, getMyStudentProfile);
router.get("/records", authenticateUser, requirePermission("assignment:read"), getAcademicRecords);
router.get("/attendance/me", authenticateUser, requireRole("Student"), getMyAttendance);

// Teacher and Admin routes
router.get("/all", authenticateUser, requireRole("Teacher", "Administrator"), getAllStudents);
router.post("/record", authenticateUser, requireRole("Teacher", "Administrator"), createAcademicRecord);
router.post("/grade", authenticateUser, requireRole("Teacher", "Administrator"), gradeAcademicRecord);
router.get("/attendance/all", authenticateUser, requireRole("Teacher", "Administrator"), getAttendanceForDate);
router.post("/attendance/bulk", authenticateUser, requireRole("Teacher", "Administrator"), markAttendanceBulk);

export default router;
