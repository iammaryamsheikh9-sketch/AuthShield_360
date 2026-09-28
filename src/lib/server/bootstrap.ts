import connectDatabase from "../../../AuthShield_360_ServerSide/src/config/connectDatabase.js";
import { seedInitialData } from "../../../AuthShield_360_ServerSide/src/utils/seedData.js";
import getAuthPhase from "../../../AuthShield_360_ServerSide/src/config/authPhase.js";
import dotenv from "dotenv";
import { resolve } from "node:path";

let bootstrapPromise: Promise<void> | undefined;

dotenv.config({ path: resolve(process.cwd(), "AuthShield_360_ServerSide", ".env") });

export function ensureBackendReady() {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      if (process.env.NODE_ENV === "production") {
        const required = ["MFA_ENCRYPTION_KEY"];
        if (getAuthPhase() === 3) required.push("SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "EMAIL_FROM");
        const missing = required.filter((key) => !process.env[key]);
        if (missing.length) throw new Error(`Missing production settings: ${missing.join(", ")}`);
      }
      await connectDatabase();
      await seedInitialData();
    })().catch((error) => {
      bootstrapPromise = undefined;
      throw error;
    });
  }
  return bootstrapPromise;
}
