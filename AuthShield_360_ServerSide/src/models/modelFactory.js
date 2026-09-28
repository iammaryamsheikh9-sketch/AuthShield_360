import mongoose from "mongoose";
import { InMemoryModel } from "../config/inMemoryDb.js";

const inMemoryRegistry = {};

let mongoIsConnected = false;

export const setMongoConnected = (connected) => {
  mongoIsConnected = connected;
};

export const isMongoConnected = () => {
  return mongoIsConnected && mongoose.connection.readyState === 1;
};

export const getInMemoryRegistry = () => inMemoryRegistry;

export function createModel(name, schema) {
  let mongooseModel = null;
  try {
    mongooseModel = mongoose.models[name] || mongoose.model(name, schema);
  } catch (err) {
    console.warn(`Could not register Mongoose model ${name}:`, err.message);
  }

  const inMemModel = new InMemoryModel(name, inMemoryRegistry);
  inMemoryRegistry[name] = inMemModel;

  return new Proxy({}, {
    get(target, prop) {
      if (isMongoConnected() && mongooseModel) {
        const val = mongooseModel[prop];
        return typeof val === "function" ? val.bind(mongooseModel) : val;
      }
      const val = inMemModel[prop];
      return typeof val === "function" ? val.bind(inMemModel) : val;
    }
  });
}
