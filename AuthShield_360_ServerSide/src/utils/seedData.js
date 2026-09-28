import bcrypt from "bcryptjs";
import Role from "../models/Role.js";
import User from "../models/User.js";
import PasswordCredential from "../models/PasswordCredential.js";
import Student from "../models/Student.js";
import AcademicRecord from "../models/AcademicRecord.js";
import Attendance from "../models/Attendance.js";
import MfaMethod from "../models/MfaMethod.js";
import SecurityTestResult from "../models/SecurityTestResult.js";
import { encryptMfaSecret } from "../services/mfaService.js";

const DEFAULT_ROLES = [
  {
    name: "Student",
    permissions: [
      "profile:read",
      "assignment:read",
      "examResult:read"
    ]
  },
  {
    name: "Teacher",
    permissions: [
      "profile:read",
      "assignment:read",
      "assignment:create",
      "assignment:update",
      "examResult:read",
      "examResult:create",
      "student:read"
    ]
  },
  {
    name: "Administrator",
    permissions: [
      "profile:read",
      "profile:update",
      "assignment:read",
      "assignment:create",
      "assignment:update",
      "assignment:delete",
      "examResult:read",
      "examResult:create",
      "examResult:update",
      "examResult:delete",
      "student:read",
      "student:create",
      "student:update",
      "student:delete",
      "user:read",
      "user:create",
      "user:update",
      "user:disable",
      "auditLog:read",
      "securityTest:read",
      "securityTest:create"
    ]
  }
];

const INITIAL_TEST_MATRIX = [
  {
    testId: "AUTH-001",
    userRole: "Student",
    testAction: "Valid password-only login",
    expectedResult: "Login succeeds",
    actualResult: "Succeeded",
    status: "PASS",
    evidence: ["Session token issued", "AuditLog: LOGIN_SUCCESS"],
    notes: "Baseline password login for Student role",
    tester: "System QA"
  },
  {
    testId: "AUTH-002",
    userRole: "Student",
    testAction: "Wrong password",
    expectedResult: "Login denied",
    actualResult: "Denied",
    status: "PASS",
    evidence: ["HTTP 401 Unauthorized", "AuditLog: LOGIN_FAILURE"],
    notes: "Failed attempts counter incremented",
    tester: "System QA"
  },
  {
    testId: "AUTH-003",
    userRole: "Student",
    testAction: "Correct password with MFA enrolled",
    expectedResult: "MFA required",
    actualResult: "MFA required",
    status: "PASS",
    evidence: ["requiresMfa: true", "Temporary session token issued"],
    notes: "Secondary factor challenge invoked",
    tester: "System QA"
  },
  {
    testId: "AUTH-004",
    userRole: "Student",
    testAction: "Valid OTP code",
    expectedResult: "Login succeeds",
    actualResult: "Succeeded",
    status: "PASS",
    evidence: ["TOTP verified with authenticator", "AuditLog: MFA_SUCCESS"],
    notes: "Full session authenticatedWithMfa: true",
    tester: "System QA"
  },
  {
    testId: "AUTH-005",
    userRole: "Student",
    testAction: "Invalid OTP code",
    expectedResult: "Login denied",
    actualResult: "Denied",
    status: "PASS",
    evidence: ["HTTP 400 Invalid MFA code", "AuditLog: MFA_FAILURE"],
    notes: "Secondary factor rejected invalid code",
    tester: "System QA"
  },
  {
    testId: "AUTH-006",
    userRole: "Student",
    testAction: "Expired OTP code",
    expectedResult: "Login denied",
    actualResult: "Denied",
    status: "PASS",
    evidence: ["HTTP 400 OTP time window expired"],
    notes: "Time window expiration enforced",
    tester: "System QA"
  },
  {
    testId: "AUTH-007",
    userRole: "Student",
    testAction: "Repeated failures (5 failed attempts)",
    expectedResult: "Account protected",
    actualResult: "Locked",
    status: "PASS",
    evidence: ["User status: locked", "AuditLog: ACCOUNT_LOCKED"],
    notes: "Brute force prevention triggered 15-minute lock",
    tester: "System QA"
  },
  {
    testId: "AUTH-008",
    userRole: "Student",
    testAction: "Access Teacher resource (/api/students/all)",
    expectedResult: "Access denied",
    actualResult: "Denied",
    status: "PASS",
    evidence: ["HTTP 403 Forbidden", "RBAC role restriction"],
    notes: "Role-based authorization restriction enforced",
    tester: "System QA"
  },
  {
    testId: "AUTH-009",
    userRole: "Teacher",
    testAction: "Access Admin resource (/api/admin/users)",
    expectedResult: "Access denied",
    actualResult: "Denied",
    status: "PASS",
    evidence: ["HTTP 403 Forbidden", "RBAC admin barrier"],
    notes: "Privilege separation between Teacher and Admin",
    tester: "System QA"
  },
  {
    testId: "AUTH-010",
    userRole: "Student",
    testAction: "Reuse session after logout",
    expectedResult: "Session invalid",
    actualResult: "Denied",
    status: "PASS",
    evidence: ["HTTP 401 Session has been revoked", "AuditLog: LOGOUT"],
    notes: "Session token invalidated on logout and cannot be replayed",
    tester: "System QA"
  }
];

export const seedInitialData = async () => {
  try {
    console.log("Seeding default roles and demo users...");

    // 1. Roles
    const roleMap = {};
    for (const r of DEFAULT_ROLES) {
      let role = await Role.findOne({ name: r.name });
      if (!role) {
        role = await Role.create(r);
        console.log(`Created role: ${r.name}`);
      } else {
        role.permissions = r.permissions;
        await role.save();
      }
      roleMap[r.name] = role;
    }

    if (process.env.NODE_ENV === "production") {
      console.log("Skipping demo accounts and sample records in production.");
      return;
    }

    // 2. Demo Users
    const demoUsers = [
      {
        username: "student1",
        email: "student1@authshield360.internal",
        password: "Student123!",
        roleName: "Student"
      },
      {
        username: "teacher1",
        email: "teacher1@authshield360.internal",
        password: "Teacher123!",
        roleName: "Teacher"
      },
      {
        username: "teacher2",
        email: "teacher2@authshield360.internal",
        password: "Teacher123!",
        roleName: "Teacher"
      },
      {
        username: "admin1",
        email: "admin1@authshield360.internal",
        password: "Admin123!",
        roleName: "Administrator"
      },
      {
        username: "student_mfa",
        email: "student_mfa@authshield360.internal",
        password: "Student123!",
        roleName: "Student",
        hasMfa: true
      }
    ];

    for (const u of demoUsers) {
      let user = await User.findOne({ username: u.username });
      if (!user) {
        const role = roleMap[u.roleName];
        user = await User.create({
          username: u.username,
          email: u.email,
          role: role._id,
          status: "active",
          emailVerified: true,
          emailVerifiedAt: new Date()
        });

        const passwordHash = await bcrypt.hash(u.password, 10);
        await PasswordCredential.create({
          user: user._id,
          passwordHash
        });

        if (u.roleName === "Student") {
          const student = await Student.create({
            user: user._id,
            studentId: u.username === "student1" ? "STU-1001" : "STU-1002",
            firstName: u.username === "student1" ? "Alex" : "Morgan",
            lastName: "Vance",
            className: "Cybersecurity & IAM",
            enrollmentYear: 2026,
            status: "active"
          });

          // Seed sample assignments and exam results
          await AcademicRecord.create({
            student: student._id,
            type: "assignment",
            subject: "Identity & Access Management",
            title: "Zero-Trust Architecture & MFA Configuration",
            description: "Analyze TOTP token lifecycle and brute-force mitigation strategies.",
            score: 95,
            maxScore: 100,
            dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            gradedAt: new Date()
          });

          await AcademicRecord.create({
            student: student._id,
            type: "assignment",
            subject: "Cryptography",
            title: "Bcrypt Salting and Hash Collision Resistance",
            description: "Demonstration of password storage security.",
            score: 90,
            maxScore: 100,
            dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
            gradedAt: new Date()
          });

          await AcademicRecord.create({
            student: student._id,
            type: "exam",
            subject: "Security Protocols",
            title: "Mid-Term Examination: Authentication Security",
            description: "Session Hijacking, Replay Attacks, and RBAC Matrix.",
            score: 88,
            maxScore: 100,
            dueDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
            gradedAt: new Date()
          });
        }

        // If demo user has MFA enabled, configure TOTP
        if (u.hasMfa) {
          const secret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
          const secretEncrypted = encryptMfaSecret(secret);

          await MfaMethod.create({
            user: user._id,
            type: "TOTP",
            secretEncrypted,
            enabled: true,
            verified: true,
            enrolledAt: new Date(),
            lastUsedAt: new Date()
          });
          console.log(`Configured MFA for ${u.username} (Demo secret: ${secret})`);
        }

        console.log(`Demo user created: ${u.username} (${u.roleName})`);
      } else if (!user.emailVerified) {
        user.emailVerified = true;
        user.emailVerifiedAt = user.emailVerifiedAt || new Date();
        await user.save();
      }
    }

    // 3. Security Test Matrix Results
    for (const test of INITIAL_TEST_MATRIX) {
      const existing = await SecurityTestResult.findOne({ testId: test.testId });
      if (!existing) {
        await SecurityTestResult.create(test);
      }
    }

    const attendanceTeacher = await User.findOne({ username: "teacher1" });
    const studentsWithAttendance = await Student.find();
    const statuses = ["present", "present", "late", "present", "absent"];
    for (const student of studentsWithAttendance) {
      for (let dayOffset = 4; dayOffset >= 0; dayOffset -= 1) {
        const attendanceDate = new Date();
        attendanceDate.setUTCHours(0, 0, 0, 0);
        attendanceDate.setUTCDate(attendanceDate.getUTCDate() - dayOffset);
        const existingAttendance = await Attendance.findOne({
          student: student._id,
          className: student.className,
          attendanceDate
        });
        if (!existingAttendance) {
          await Attendance.create({
            student: student._id,
            className: student.className,
            attendanceDate,
            status: statuses[(4 - dayOffset) % statuses.length],
            notes: "",
            markedBy: attendanceTeacher._id
          });
        }
      }
    }

    console.log("Database seeded successfully with roles, demo accounts, academic records, attendance, and security test matrix.");
  } catch (err) {
    console.error("Seeding warning:", err.message);
  }
};
