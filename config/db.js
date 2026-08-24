const dns = require("dns");
const mongoose = require("mongoose");

const configureDnsServers = () => {
  const servers = process.env.MONGO_DNS_SERVERS
    ?.split(",")
    .map((server) => server.trim())
    .filter(Boolean);

  if (servers?.length) {
    dns.setServers(servers);
  }
};

const connectDB = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is not configured");
  }

  configureDnsServers();

  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
    });
    console.log("MongoDB connected successfully");
  } catch (error) {
    const hint = error.code === "ECONNREFUSED" && process.env.MONGO_URI.startsWith("mongodb+srv://")
      ? " Check DNS access or set MONGO_DNS_SERVERS (for example: 8.8.8.8,1.1.1.1)."
      : "";
    console.error(`MongoDB connection failed: ${error.message}.${hint}`);
    throw error;
  }
};

module.exports = connectDB;
