import AuditLog from "../models/AuditLog.js";

const createAuditLog = async ({
  userId = null,
  username = "unknown",
  role = null,
  eventType,
  action,
  result,
  ipAddress = null,
  userAgent = null,
  metadata = {},
  sessionId = null
}) => {
  try {
    const auditLog = await AuditLog.create({
      user: userId,
      username,
      role,
      eventType,
      action,
      result,
      ipAddress,
      userAgent,
      metadata,
      sessionId
    });

    return auditLog;
  } catch (error) {
    console.error("Audit log error:", error.message);

    return null;
  }
};

export default createAuditLog;