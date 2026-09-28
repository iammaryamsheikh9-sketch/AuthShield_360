import express from "express";
import authenticateUser from "../middleware/authMiddleware.js";
import {
  getMfaStatus,
  enrollMfa,
  verifyMfa,
  disableMfa
} from "../controllers/mfaController.js";

const router = express.Router();

router.get("/status", authenticateUser, getMfaStatus);
router.post("/enroll", authenticateUser, enrollMfa);
router.post("/verify", authenticateUser, verifyMfa);
router.post("/disable", authenticateUser, disableMfa);

export default router;