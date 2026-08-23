const Schedule = require("../models/Schedule");
const User = require("../models/User");

const isManager = (role) => ["admin", "staff"].includes(role);
const day = (value) => { const date = new Date(value); if (Number.isNaN(date.getTime())) return null; date.setUTCHours(0, 0, 0, 0); return date; };

const createSchedule = async (req, res, next) => {
  try {
    const { staff, date, startTime, endTime, isAvailable } = req.body;
    const scheduleDate = day(date);
    if (!staff || !scheduleDate || !startTime || !endTime || startTime >= endTime) return res.status(400).json({ message: "staff, a valid date, and a valid time range are required" });
    if (!isManager(req.user.role) && staff !== req.user.id) return res.status(403).json({ message: "Not authorized" });
    const staffUser = await User.findById(staff);
    if (!staffUser || !["doctor", "staff"].includes(staffUser.role)) return res.status(400).json({ message: "staff must be a doctor or staff user" });
    const schedule = await Schedule.create({ staff, date: scheduleDate, startTime, endTime, isAvailable });
    res.status(201).json({ message: "Schedule created", schedule });
  } catch (error) { if (error?.code === 11000) return res.status(409).json({ message: "This schedule already exists" }); next(error); }
};

const getSchedules = async (req, res, next) => {
  try {
    const filter = {}; if (req.query.staff) filter.staff = req.query.staff; if (req.user.role === "doctor") filter.staff = req.user.id;
    const schedules = await Schedule.find(filter).populate("staff", "fullName email role").sort({ date: 1, startTime: 1 });
    res.json({ schedules });
  } catch (error) { next(error); }
};

const updateSchedule = async (req, res, next) => {
  try {
    const schedule = await Schedule.findById(req.params.id); if (!schedule) return res.status(404).json({ message: "Schedule not found" });
    if (!isManager(req.user.role) && schedule.staff.toString() !== req.user.id) return res.status(403).json({ message: "Not authorized" });
    ["startTime", "endTime", "isAvailable"].forEach((key) => { if (req.body[key] !== undefined) schedule[key] = req.body[key]; });
    if (schedule.startTime >= schedule.endTime) return res.status(400).json({ message: "startTime must be before endTime" });
    await schedule.save(); res.json({ message: "Schedule updated", schedule });
  } catch (error) { next(error); }
};

const deleteSchedule = async (req, res, next) => {
  try { const schedule = await Schedule.findById(req.params.id); if (!schedule) return res.status(404).json({ message: "Schedule not found" }); if (!isManager(req.user.role) && schedule.staff.toString() !== req.user.id) return res.status(403).json({ message: "Not authorized" }); await schedule.deleteOne(); res.status(204).send(); } catch (error) { next(error); }
};
module.exports = { createSchedule, getSchedules, updateSchedule, deleteSchedule };
