const User = require("../models/User");
const bcrypt = require("bcryptjs");
const generateToken = require("../utils/generateToken");

const register = async (req, res) => {
  try {
    const { fullName, email, password, role } = req.body;
    const normalizedEmail = email?.trim().toLowerCase();
    const requestedRole = role?.toLowerCase();

    if (!fullName?.trim() || !normalizedEmail || !password || password.length < 8) {
      return res.status(400).json({ message: "fullName, email, and a password of at least 8 characters are required" });
    }
    if (requestedRole && !["admin", "doctor", "staff", "patient"].includes(requestedRole)) {
      return res.status(400).json({ message: "Invalid role" });
    }
    const normalizedRole = process.env.ALLOW_PUBLIC_STAFF_REGISTRATION === "true" ? (requestedRole || "patient") : "patient";

    const existingUser = await User.findOne({ email: normalizedEmail });

    if (existingUser) {
      return res.status(400).json({
        message: "User already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      fullName,
      email: normalizedEmail,
      password: hashedPassword,
      role: normalizedRole,
    });

    res.status(201).json({
      message: "Registration successful",
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({
      message: "Registration failed",
      error: error.message,
    });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = email?.trim().toLowerCase();
    if (!normalizedEmail || !password) return res.status(400).json({ message: "email and password are required" });

    const user = await User.findOne({ email: normalizedEmail }).select("+password");

    if (!user) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    const token = generateToken(user);

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({
      message: "Login failed",
      error: error.message,
    });
  }
};

module.exports = {
  register,
  login,
};
