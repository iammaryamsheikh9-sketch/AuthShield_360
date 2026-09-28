import User from "../models/User.js";
import Role from "../models/Role.js";
import PasswordCredential from "../models/PasswordCredential.js";
import AuditLog from "../models/AuditLog.js";
import SecurityTestResult from "../models/SecurityTestResult.js";
import createAuditLog from "../services/auditService.js";

const getAllUsers = async (req, res) => {
  try {
    const users = await User.find().populate("role");
    const roles = await Role.find();

    const formattedUsers = users.map((u) => ({
      id: u._id,
      username: u.username,
      email: u.email,
      role: u.role?.name || "Unknown",
      roleId: u.role?._id,
      status: u.status,
      lastLoginAt: u.lastLoginAt,
      createdAt: u.createdAt
    }));

    return res.status(200).json({
      success: true,
      users: formattedUsers,
      roles
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const updateUserStatus = async (req, res) => {
  try {
    const { userId, status } = req.body;

    if (!userId || !["active", "locked", "disabled"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Valid userId and status (active, locked, disabled) required"
      });
    }

    const user = await User.findById(userId).populate("role");
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    user.status = status;
    await user.save();

    // If unlocked, reset credential failedAttempts & lock
    if (status === "active") {
      const cred = await PasswordCredential.findOne({ user: userId });
      if (cred) {
        cred.failedAttempts = 0;
        cred.lockedUntil = null;
        await cred.save();
      }
    }

    await createAuditLog({
      userId: req.user._id,
      username: req.user.username,
      role: req.user.role?.name || "Administrator",
      eventType: "ADMIN_ACTION",
      action: `Admin updated status of user ${user.username} to ${status}`,
      result: "success",
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
      metadata: { targetUser: user.username, targetStatus: status }
    });

    return res.status(200).json({
      success: true,
      message: `User status changed to ${status}`,
      user: {
        id: user._id,
        username: user.username,
        status: user.status
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const updateUserRole = async (req, res) => {
  try {
    const { userId, roleName } = req.body;

    const role = await Role.findOne({ name: roleName });
    if (!role) {
      return res.status(400).json({ success: false, message: "Invalid role name" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    user.role = role._id;
    await user.save();

    await createAuditLog({
      userId: req.user._id,
      username: req.user.username,
      role: req.user.role?.name || "Administrator",
      eventType: "ADMIN_ACTION",
      action: `Admin assigned role ${roleName} to ${user.username}`,
      result: "success",
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
      metadata: { targetUser: user.username, targetRole: roleName }
    });

    return res.status(200).json({
      success: true,
      message: `User role updated to ${roleName}`
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getAuditLogs = async (req, res) => {
  try {
    const { eventType, role, limit = 100 } = req.query;
    const filter = {};

    if (eventType) filter.eventType = eventType;
    if (role) filter.role = role;

    const logs = await AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .limit(Number(limit));

    return res.status(200).json({
      success: true,
      count: logs.length,
      logs
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getSecurityTests = async (req, res) => {
  try {
    const tests = await SecurityTestResult.find().sort({ testId: 1 });
    return res.status(200).json({
      success: true,
      tests
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const recordSecurityTestResult = async (req, res) => {
  try {
    const {
      testId,
      userRole,
      testAction,
      expectedResult,
      actualResult,
      status,
      loginTimeMs,
      evidence,
      notes
    } = req.body;

    if (!testId || !userRole || !testAction || !status) {
      return res.status(400).json({
        success: false,
        message: "testId, userRole, testAction, and status are required"
      });
    }

    const testResult = await SecurityTestResult.findOneAndUpdate(
      { testId },
      {
        testId,
        user: req.user._id,
        userRole,
        testAction,
        expectedResult,
        actualResult,
        status,
        loginTimeMs: loginTimeMs ? Number(loginTimeMs) : null,
        evidence: Array.isArray(evidence) ? evidence : [evidence].filter(Boolean),
        notes: notes || "",
        tester: req.user.username,
        testedAt: new Date()
      },
      { upsert: true, new: true }
    );

    return res.status(200).json({
      success: true,
      message: `Security test ${testId} recorded`,
      testResult
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export {
  getAllUsers,
  updateUserStatus,
  updateUserRole,
  getAuditLogs,
  getSecurityTests,
  recordSecurityTestResult
};
