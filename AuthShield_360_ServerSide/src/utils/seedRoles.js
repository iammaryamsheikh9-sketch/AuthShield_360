import dotenv from "dotenv";
import connectDatabase from "../config/database.js";
import Role from "../models/Role.js";

dotenv.config();

const roles = [
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

const seedRoles = async () => {
  try {
    await connectDatabase();

    for (const roleData of roles) {
      const existingRole = await Role.findOne({
        name: roleData.name
      });

      if (existingRole) {
        existingRole.permissions = roleData.permissions;

        await existingRole.save();

        console.log(`${roleData.name} role already exists`);
        continue;
      }

      await Role.create(roleData);

      console.log(`${roleData.name} role created`);
    }

    console.log("Role seeding completed successfully");

    process.exit(0);
  } catch (error) {
    console.error("Role seeding failed:", error.message);

    process.exit(1);
  }
};

seedRoles();