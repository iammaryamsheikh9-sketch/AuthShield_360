import mongoose from "mongoose";
import { setMongoConnected } from "../models/modelFactory.js";

const connectDatabase = async () => {
  const databaseMode = process.env.DATABASE_MODE || (process.env.NODE_ENV === "production" ? "mongodb" : "local");
  const mongoUri = databaseMode === "local"
    ? process.env.LOCAL_MONGO_URI || "mongodb://127.0.0.1:27017/authshield360"
    : process.env.MONGO_URI;

  if (mongoUri && mongoUri.trim().length > 0) {
    try {
      console.log(`Connecting to ${databaseMode === "local" ? "local" : "configured"} MongoDB...`);
      const connection = await mongoose.connect(mongoUri, {
        serverSelectionTimeoutMS: 5000
      });
      setMongoConnected(true);
      console.log(`Connected to MongoDB: ${connection.connection.host}`);
      return connection;
    } catch (err) {
      console.warn(`Could not connect to external MONGO_URI (${err.message}).`);
      if (process.env.NODE_ENV === "production") {
        throw new Error("MongoDB is unavailable; refusing to start without persistent storage");
      }
    }
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("MONGO_URI must be configured in production");
  }

  // Use built-in in-memory database engine
  setMongoConnected(false);
  console.log("Using built-in AuthShield 360 In-Memory Engine (Fast & Zero Setup).");
  return null;
};

const disconnectDatabase = async () => {
  try {
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }
    setMongoConnected(false);
    console.log("Database disconnected");
  } catch (err) {
    console.error("Error disconnecting database:", err.message);
  }
};

export { connectDatabase as default, disconnectDatabase };