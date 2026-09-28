import Student from "../models/Student.js";
import AcademicRecord from "../models/AcademicRecord.js";
import Attendance from "../models/Attendance.js";
import User from "../models/User.js";
import createAuditLog from "../services/auditService.js";

const attendanceStatuses = ["present", "absent", "late", "excused"];
const parseAttendanceDate = (value) => {
  const dateText = value || new Date().toISOString().slice(0, 10);
  if (typeof dateText !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return null;
  const date = new Date(`${dateText}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateText ? null : date;
};

const getMyStudentProfile = async (req, res) => {
  try {
    let student = await Student.findOne({ user: req.user._id });

    if (!student) {
      // Auto-create student profile if missing
      student = await Student.create({
        user: req.user._id,
        studentId: `STU-${Math.floor(1000 + Math.random() * 9000)}`,
        firstName: req.user.username,
        lastName: "Student",
        className: "Cybersecurity & Identity",
        enrollmentYear: 2026,
        status: "active"
      });
    }

    const records = await AcademicRecord.find({ student: student._id });

    return res.status(200).json({
      success: true,
      student,
      records
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

const getAcademicRecords = async (req, res) => {
  try {
    const student = await Student.findOne({ user: req.user._id });
    if (!student) {
      return res.status(404).json({ success: false, message: "Student record not found" });
    }

    const records = await AcademicRecord.find({ student: student._id });
    return res.status(200).json({
      success: true,
      records
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getAllStudents = async (req, res) => {
  try {
    const students = await Student.find().populate("user");
    return res.status(200).json({
      success: true,
      students
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const createAcademicRecord = async (req, res) => {
  try {
    const { studentId, type, subject, title, description, maxScore, score, dueDate } = req.body;

    if (!studentId || !type || !subject || !title) {
      return res.status(400).json({
        success: false,
        message: "studentId, type, subject, and title are required"
      });
    }

    const record = await AcademicRecord.create({
      student: studentId,
      type: type || "assignment",
      subject,
      title,
      description: description || "",
      maxScore: Number(maxScore) || 100,
      score: score !== undefined && score !== null ? Number(score) : null,
      dueDate: dueDate ? new Date(dueDate) : null,
      gradedAt: score !== null ? new Date() : null,
      teacher: req.user._id
    });

    return res.status(201).json({
      success: true,
      message: "Academic record created successfully",
      record
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const gradeAcademicRecord = async (req, res) => {
  try {
    const { recordId, score } = req.body;

    if (!recordId || score === undefined) {
      return res.status(400).json({ success: false, message: "recordId and score are required" });
    }

    const record = await AcademicRecord.findByIdAndUpdate(
      recordId,
      {
        score: Number(score),
        gradedAt: new Date(),
        teacher: req.user._id
      }
    );

    if (!record) {
      return res.status(404).json({ success: false, message: "Record not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Record graded successfully",
      record
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getMyAttendance = async (req, res) => {
  try {
    const student = await Student.findOne({ user: req.user._id });
    if (!student) return res.status(404).json({ success: false, message: "Student record not found" });
    const records = await Attendance.find({ student: student._id }).sort({ attendanceDate: -1 });
    const presentCount = records.filter((record) => record.status === "present" || record.status === "late").length;
    return res.status(200).json({
      success: true,
      records,
      summary: {
        total: records.length,
        present: records.filter((record) => record.status === "present").length,
        absent: records.filter((record) => record.status === "absent").length,
        attendanceRate: records.length ? Math.round((presentCount / records.length) * 100) : null
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getAttendanceForDate = async (req, res) => {
  try {
    const attendanceDate = parseAttendanceDate(req.query.date);
    if (!attendanceDate) return res.status(400).json({ success: false, message: "date must use YYYY-MM-DD format" });
    const filter = { attendanceDate };
    if (req.query.className) filter.className = req.query.className;
    const records = await Attendance.find(filter).populate("student").sort({ className: 1 });
    return res.status(200).json({ success: true, records, date: attendanceDate.toISOString().slice(0, 10) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const markAttendanceBulk = async (req, res) => {
  try {
    const attendanceDate = parseAttendanceDate(req.body.date);
    const { className, records } = req.body;
    if (!attendanceDate || !className || !Array.isArray(records) || records.length === 0 || records.length > 100) {
      return res.status(400).json({ success: false, message: "A valid date, className, and 1-100 attendance records are required" });
    }

    const validatedRecords = [];
    const seenStudentIds = new Set();
    for (const item of records) {
      if (!item || typeof item.studentId !== "string" || !attendanceStatuses.includes(item.status)) {
        return res.status(400).json({ success: false, message: "Each record requires a studentId and valid status" });
      }
      if (seenStudentIds.has(item.studentId)) {
        return res.status(400).json({ success: false, message: "Each student can appear only once per attendance batch" });
      }
      seenStudentIds.add(item.studentId);
      const student = await Student.findById(item.studentId);
      if (!student) return res.status(404).json({ success: false, message: `Student ${item.studentId} was not found` });
      if (student.className !== className) {
        return res.status(400).json({ success: false, message: `Student ${student.studentId} is not enrolled in ${className}` });
      }
      validatedRecords.push({ student, item });
    }

    const savedRecords = [];
    for (const { student, item } of validatedRecords) {
      const attendance = await Attendance.findOneAndUpdate(
        { student: student._id, className, attendanceDate },
        { student: student._id, className, attendanceDate, status: item.status, notes: String(item.notes || "").slice(0, 500), markedBy: req.user._id },
        { upsert: true, new: true }
      );
      savedRecords.push(attendance);
    }

    await createAuditLog({
      userId: req.user._id,
      username: req.user.username,
      role: req.user.role?.name || "Unknown",
      eventType: "ATTENDANCE_MARKED",
      action: `Attendance recorded for ${savedRecords.length} student(s) in ${className}`,
      result: "success",
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
      metadata: { className, date: attendanceDate.toISOString().slice(0, 10), count: savedRecords.length }
    });

    return res.status(200).json({ success: true, message: "Attendance saved", records: savedRecords });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export {
  getMyStudentProfile,
  getAcademicRecords,
  getAllStudents,
  createAcademicRecord,
  gradeAcademicRecord,
  getMyAttendance,
  getAttendanceForDate,
  markAttendanceBulk
};
