import * as authController from "../../../AuthShield_360_ServerSide/src/controllers/authController.js";
import * as adminController from "../../../AuthShield_360_ServerSide/src/controllers/adminController.js";
import * as mfaController from "../../../AuthShield_360_ServerSide/src/controllers/mfaController.js";
import * as studentController from "../../../AuthShield_360_ServerSide/src/controllers/studentController.js";
import authenticateUser from "../../../AuthShield_360_ServerSide/src/middleware/authMiddleware.js";
import authenticateMfaSession from "../../../AuthShield_360_ServerSide/src/middleware/mfaLoginMiddleware.js";
import { requirePermission, requireRole } from "../../../AuthShield_360_ServerSide/src/middleware/roleMiddleware.js";
import { adminProfile, healthCheck, rootCheck } from "./system-controller";

const systemController = {
  adminTest: (_req: any, res: any) => res.status(200).json({ success: true, message: "Administrator access granted" }),
  studentTest: (_req: any, res: any) => res.status(200).json({ success: true, message: "Student access granted" }),
  assignment: (_req: any, res: any) => res.status(200).json({ success: true, message: "Assignment access granted" })
};

export type NextApiHandler = (req: any, res: any, next: (error?: unknown) => void) => unknown;
export type RouteDefinition = {
  method: string;
  pattern: RegExp;
  middleware: NextApiHandler[];
  controller: NextApiHandler;
};

const publicRoute = (method: string, path: string, controller: NextApiHandler, middleware: NextApiHandler[] = []): RouteDefinition => ({
  method,
  pattern: new RegExp(`^${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`),
  middleware,
  controller
});
const auth = [authenticateUser as NextApiHandler];
const admin = [...auth, requireRole("Administrator") as NextApiHandler];
const teacher = [...auth, requireRole("Teacher", "Administrator") as NextApiHandler];

const routes: RouteDefinition[] = [
  publicRoute("GET", "/api", rootCheck),
  publicRoute("GET", "/api/health", healthCheck),
  publicRoute("GET", "/api/auth/config", authController.getAuthConfig),
  publicRoute("POST", "/api/auth/verify-email", authController.verifyEmail),
  publicRoute("POST", "/api/auth/resend-verification", authController.resendEmailVerification),
  publicRoute("POST", "/api/auth/register", authController.registerUser),
  publicRoute("POST", "/api/auth/login", authController.login),
  publicRoute("POST", "/api/auth/login/mfa", authController.verifyLoginMfa, [authenticateMfaSession as NextApiHandler]),
  publicRoute("POST", "/api/auth/login/email-otp", authController.verifyLoginEmailCode, [authenticateMfaSession as NextApiHandler]),
  publicRoute("POST", "/api/auth/logout", authController.logout, auth),
  publicRoute("GET", "/api/users/profile", adminProfile, auth),
  publicRoute("GET", "/api/users/admin-test", systemController.adminTest, [...auth, requireRole("Administrator") as NextApiHandler]),
  publicRoute("GET", "/api/users/student-test", systemController.studentTest, [...auth, requireRole("Student") as NextApiHandler]),
  publicRoute("GET", "/api/users/assignment", systemController.assignment, [...auth, requirePermission("assignment:read") as NextApiHandler]),
  publicRoute("GET", "/api/mfa/status", mfaController.getMfaStatus, auth),
  publicRoute("POST", "/api/mfa/enroll", mfaController.enrollMfa, auth),
  publicRoute("POST", "/api/mfa/email/enroll", mfaController.enrollEmailFactor, auth),
  publicRoute("POST", "/api/mfa/email/verify", mfaController.verifyEmailFactor, auth),
  publicRoute("POST", "/api/mfa/email/disable", mfaController.disableEmailFactor, auth),
  publicRoute("POST", "/api/mfa/verify", mfaController.verifyMfa, auth),
  publicRoute("POST", "/api/mfa/disable", mfaController.disableMfa, auth),
  publicRoute("GET", "/api/students/profile", studentController.getMyStudentProfile, auth),
  publicRoute("GET", "/api/students/records", studentController.getAcademicRecords, [...auth, requirePermission("assignment:read") as NextApiHandler]),
  publicRoute("GET", "/api/students/attendance/me", studentController.getMyAttendance, [...auth, requireRole("Student") as NextApiHandler]),
  publicRoute("GET", "/api/students/all", studentController.getAllStudents, teacher),
  publicRoute("POST", "/api/students/record", studentController.createAcademicRecord, teacher),
  publicRoute("POST", "/api/students/grade", studentController.gradeAcademicRecord, teacher),
  publicRoute("GET", "/api/students/attendance/all", studentController.getAttendanceForDate, teacher),
  publicRoute("POST", "/api/students/attendance/bulk", studentController.markAttendanceBulk, teacher),
  publicRoute("GET", "/api/admin/users", adminController.getAllUsers, admin),
  publicRoute("POST", "/api/admin/users/status", adminController.updateUserStatus, admin),
  publicRoute("POST", "/api/admin/users/role", adminController.updateUserRole, admin),
  publicRoute("GET", "/api/admin/audit-logs", adminController.getAuditLogs, admin),
  publicRoute("GET", "/api/admin/security-tests", adminController.getSecurityTests, admin),
  publicRoute("POST", "/api/admin/security-tests", adminController.recordSecurityTestResult, admin)
];

export default routes;
