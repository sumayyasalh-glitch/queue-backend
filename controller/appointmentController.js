const Appointment = require("../models/Appointments");
const Queue = require("../models/Queue");
const User = require("../models/User");
const Notification = require("../models/Notification");

const privilegedRoles = ["admin", "staff"];
const queuedStatuses = ["Pending", "Confirmed", "Waiting"];
const dateOnly = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCHours(0, 0, 0, 0);
  return date;
};

const canManage = (user) => privilegedRoles.includes(user.role);
const canAccess = (appointment, user) =>
  canManage(user) || appointment.patient._id?.toString() === user.id || appointment.patient.toString() === user.id || appointment.doctor._id?.toString() === user.id || appointment.doctor.toString() === user.id;

const updateQueueCount = (doctor, date, amount) => Queue.updateOne(
  { doctor, date },
  { $inc: { waitingCount: amount } }
);

const createAppointment = async (req, res, next) => {
  try {
    if (req.user.role !== "patient") return res.status(403).json({ message: "Only patients can book appointments" });
    const { doctor, date, timeSlot, reason } = req.body;
    const appointmentDate = dateOnly(date);
    if (!doctor || !appointmentDate || !timeSlot) {
      return res.status(400).json({ message: "doctor, date, and timeSlot are required" });
    }

    const doctorUser = await User.findOne({ _id: doctor, role: "doctor" });
    if (!doctorUser) return res.status(404).json({ message: "Doctor not found" });

    const queue = await Queue.findOneAndUpdate(
      { doctor, date: appointmentDate },
      { $inc: { lastToken: 1, waitingCount: 1 }, $setOnInsert: { currentToken: 0 } },
      { new: true, upsert: true, runValidators: true }
    );

    try {
      const appointment = await Appointment.create({
        patient: req.user.id,
        doctor,
        date: appointmentDate,
        timeSlot,
        reason,
        tokenNumber: queue.lastToken,
        status: "Pending",
      });
      await Notification.create({ user: req.user.id, type: "appointment", message: `Appointment booked. Your token number is ${appointment.tokenNumber}.` });
      return res.status(201).json({ message: "Appointment created", appointment });
    } catch (error) {
      await Queue.updateOne({ _id: queue._id, lastToken: queue.lastToken }, { $inc: { lastToken: -1, waitingCount: -1 } });
      if (error?.code === 11000) return res.status(409).json({ message: "This doctor already has an appointment in that time slot" });
      throw error;
    }
  } catch (error) { next(error); }
};

const getAppointments = async (req, res, next) => {
  try {
    const filter = {};
    if (req.user.role === "patient") filter.patient = req.user.id;
    if (req.user.role === "doctor") filter.doctor = req.user.id;
    if (req.query.doctor && req.user.role !== "doctor") filter.doctor = req.query.doctor;
    if (req.query.patient && canManage(req.user)) filter.patient = req.query.patient;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.date) {
      const day = dateOnly(req.query.date);
      if (!day) return res.status(400).json({ message: "Invalid date" });
      const nextDay = new Date(day); nextDay.setUTCDate(day.getUTCDate() + 1);
      filter.date = { $gte: day, $lt: nextDay };
    }
    const appointments = await Appointment.find(filter).populate("patient", "fullName email").populate("doctor", "fullName email").sort({ date: 1, timeSlot: 1 });
    res.json({ appointments });
  } catch (error) { next(error); }
};

const getAppointment = async (req, res, next) => {
  try {
    const appointment = await Appointment.findById(req.params.id).populate("patient", "fullName email").populate("doctor", "fullName email");
    if (!appointment) return res.status(404).json({ message: "Appointment not found" });
    if (!canAccess(appointment, req.user)) return res.status(403).json({ message: "Not authorized" });
    res.json({ appointment });
  } catch (error) { next(error); }
};

const updateAppointment = async (req, res, next) => {
  try {
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) return res.status(404).json({ message: "Appointment not found" });
    if (!canAccess(appointment, req.user)) return res.status(403).json({ message: "Not authorized" });

    const isPatient = appointment.patient.toString() === req.user.id;
    const originalDate = new Date(appointment.date);
    const originalStatus = appointment.status;
    const allowed = isPatient ? ["date", "timeSlot", "reason", "status"] : req.user.role === "doctor" ? ["status"] : ["date", "timeSlot", "reason", "status"];
    for (const key of allowed) if (req.body[key] !== undefined) appointment[key] = key === "date" ? dateOnly(req.body[key]) : req.body[key];
    if (req.body.date !== undefined && !appointment.date) return res.status(400).json({ message: "Invalid date" });
    if (isPatient && req.body.status && req.body.status !== "Cancelled") return res.status(403).json({ message: "Patients can only cancel appointments" });
    if (isPatient && !queuedStatuses.includes(originalStatus) && (req.body.date !== undefined || req.body.timeSlot !== undefined)) {
      return res.status(409).json({ message: "Only appointments waiting in the queue can be rescheduled" });
    }

    const wasQueued = queuedStatuses.includes(originalStatus);
    const isQueued = queuedStatuses.includes(appointment.status);
    const movedDate = originalDate.getTime() !== appointment.date.getTime();

    if (movedDate) {
      if (wasQueued) await updateQueueCount(appointment.doctor, originalDate, -1);
      if (isQueued) {
        const newQueue = await Queue.findOneAndUpdate(
          { doctor: appointment.doctor, date: appointment.date },
          { $inc: { lastToken: 1, waitingCount: 1 }, $setOnInsert: { currentToken: 0 } },
          { new: true, upsert: true, runValidators: true }
        );
        appointment.tokenNumber = newQueue.lastToken;
      }
    } else if (!movedDate && wasQueued !== isQueued) {
      await updateQueueCount(appointment.doctor, appointment.date, isQueued ? 1 : -1);
    }

    await appointment.save();
    await Notification.create({ user: appointment.patient, type: "appointment", message: `Your appointment status is now ${appointment.status}.` });
    res.json({ message: "Appointment updated", appointment });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ message: "This doctor already has an appointment in that time slot" });
    next(error);
  }
};

module.exports = { createAppointment, getAppointments, getAppointment, updateAppointment };
