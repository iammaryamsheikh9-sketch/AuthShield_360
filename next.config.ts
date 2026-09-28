import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "bcryptjs",
    "mongoose",
    "mongodb",
    "otplib",
    "qrcode",
    "nodemailer"
  ]
};

export default nextConfig;
