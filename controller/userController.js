const bcrypt = require("bcryptjs");
const User = require("../models/User");

const staffRoles = ["admin", "doctor", "staff"];

const sanitizeUser = (user) => ({
  id: user._id,
  fullName: user.fullName,
  email: user.email,
  role: user.role,
  createdAt: user.createdAt,
});

const getCurrentUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ user: sanitizeUser(user) });
  } catch (error) { next(error); }
};

const updateCurrentUser = async (req, res, next) => {
  try {
    const { fullName, email, currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id).select("+password");
    if (!user) return res.status(404).json({ message: "User not found" });

    if (fullName !== undefined) {
      if (!fullName.trim()) return res.status(400).json({ message: "fullName cannot be empty" });
      user.fullName = fullName.trim();
    }
    if (email !== undefined) {
      const normalizedEmail = email.trim().toLowerCase();
      if (!normalizedEmail) return res.status(400).json({ message: "email cannot be empty" });
      const used = await User.exists({ email: normalizedEmail, _id: { $ne: user._id } });
      if (used) return res.status(409).json({ message: "Email is already in use" });
      user.email = normalizedEmail;
    }
    if (newPassword !== undefined) {
      if (!currentPassword || !(await bcrypt.compare(currentPassword, user.password))) return res.status(401).json({ message: "Current password is incorrect" });
      if (newPassword.length < 8) return res.status(400).json({ message: "New password must be at least 8 characters" });
      user.password = await bcrypt.hash(newPassword, 10);
    }
    await user.save();
    res.json({ message: "Profile updated", user: sanitizeUser(user) });
  } catch (error) { next(error); }
};

const getDoctors = async (req, res, next) => {
  try {
    const doctors = await User.find({ role: "doctor" }).select("fullName email role").sort({ fullName: 1 });
    res.json({ doctors: doctors.map(sanitizeUser) });
  } catch (error) { next(error); }
};

const createStaffUser = async (req, res, next) => {
  try {
    if (req.user.role !== "admin") return res.status(403).json({ message: "Admin access required" });
    const { fullName, email, password, role } = req.body;
    const normalizedEmail = email?.trim().toLowerCase();
    const normalizedRole = role?.toLowerCase();
    if (!fullName?.trim() || !normalizedEmail || !password || password.length < 8 || !staffRoles.includes(normalizedRole)) {
      return res.status(400).json({ message: "fullName, email, password (8+ characters), and an admin, doctor, or staff role are required" });
    }
    if (await User.exists({ email: normalizedEmail })) return res.status(409).json({ message: "Email is already in use" });
    const user = await User.create({ fullName: fullName.trim(), email: normalizedEmail, password: await bcrypt.hash(password, 10), role: normalizedRole });
    res.status(201).json({ message: "User created", user: sanitizeUser(user) });
  } catch (error) { next(error); }
};

module.exports = { getCurrentUser, updateCurrentUser, getDoctors, createStaffUser };
