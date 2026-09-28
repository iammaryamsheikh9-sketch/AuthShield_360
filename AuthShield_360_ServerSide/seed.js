import "dotenv/config";
import connectDatabase, { disconnectDatabase } from "./src/config/connectDatabase.js";
import { seedInitialData } from "./src/utils/seedData.js";

try {
  await connectDatabase();
  await seedInitialData();
  await disconnectDatabase();
} catch (error) {
  console.error("Seeding failed:", error.message);
  process.exitCode = 1;
}