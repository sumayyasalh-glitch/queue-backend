const Queue = require("../models/Queue");
const Appointment = require("../models/Appointments");
const User = require("../models/User");
const Notification = require("../models/Notification");
const { sendEmail } = require("../utils/emailService");

const day = (value) => { const date = new Date(value); if (Number.isNaN(date.getTime())) return null; date.setUTCHours(0, 0, 0, 0); return date; };
const rangeFor = (date) => { const start = day(date); if (!start) return null; const end = new Date(start); end.setUTCDate(end.getUTCDate() + 1); return { start, end }; };

const getQueue = async (req, res, next) => {
  try {
    const { doctor, date = new Date().toISOString() } = req.query; const range = rangeFor(date);
    if (!doctor || !range) return res.status(400).json({ message: "doctor and a valid date are required" });
    if (req.user.role === "doctor" && doctor !== req.user.id) return res.status(403).json({ message: "Not authorized" });
    const [queue, appointments] = await Promise.all([
      Queue.findOne({ doctor, date: range.start }),
      Appointment.find({ doctor, date: { $gte: range.start, $lt: range.end } }).populate("patient", "fullName").sort({ tokenNumber: 1 }),
    ]);
    if (req.user.role === "patient") {
      return res.json({
        queue: queue || { doctor, date: range.start, currentToken: 0, lastToken: 0, waitingCount: 0 },
        appointments: appointments.map((appointment) => ({ tokenNumber: appointment.tokenNumber, timeSlot: appointment.timeSlot, status: appointment.status })),
      });
    }
    res.json({ queue: queue || { doctor, date: range.start, currentToken: 0, lastToken: 0, waitingCount: 0 }, appointments });
  } catch (error) { next(error); }
};

const callNext = async (req, res, next) => {
  try {
    const { date = new Date().toISOString() } = req.body; 
    const range = rangeFor(date);
    if (!range || !["doctor", "admin", "staff"].includes(req.user.role)) return res.status(403).json({ message: "Not authorized or invalid date" });
    const doctor = req.user.role === "doctor" ? req.user.id : req.body.doctor;
    if (!doctor) return res.status(400).json({ message: "doctor is required" });
    
    await Appointment.updateMany({ doctor, date: { $gte: range.start, $lt: range.end }, status: "In Consultation" }, { status: "Completed" });
    const appointment = await Appointment.findOneAndUpdate({ doctor, date: { $gte: range.start, $lt: range.end }, status: { $in: ["Pending", "Confirmed", "Waiting"] } }, { status: "In Consultation" }, { sort: { tokenNumber: 1 }, new: true }).populate("patient", "fullName email").populate("doctor", "fullName email");
    
    if (!appointment) return res.status(404).json({ message: "No waiting appointments" });
    
    const queue = await Queue.findOneAndUpdate({ doctor, date: range.start }, { $set: { currentToken: appointment.tokenNumber }, $inc: { waitingCount: -1 } }, { new: true });
    
    // ==================================================
    // SEND EMAIL & IN-APP NOTIFICATION TO PATIENT
    // ==================================================
    
    // Create in-app notification
    await Notification.create({
      user: appointment.patient,
      type: "queue",
      message: `Your turn has been called! Token #${appointment.tokenNumber} - Please proceed to the consultation room.`
    });
    
    // Send email to patient
    if (appointment.patient.email) {
      sendEmail(
        appointment.patient.email,
        "Your Turn - QueueCare",
        `Hello ${appointment.patient.fullName || "Patient"},

Your turn has been called! Please proceed to the consultation room immediately.

Token Number: ${appointment.tokenNumber}
Doctor: ${appointment.doctor?.fullName || "Doctor"}
Time: ${new Date().toLocaleTimeString()}

Thank you,
QueueCare Team`
      )
        .then((result) => {
          if (!result.success) {
            console.error(`Failed to send queue call email: ${result.error}`);
          } else {
            console.log(`Queue call notification sent to patient ${appointment.patient.email}`);
          }
        })
        .catch((error) => {
          console.error("Queue call email error:", error.message);
        });
    }
    
    res.json({ message: "Next patient called", queue, appointment });
  } catch (error) { next(error); }
};
module.exports = { getQueue, callNext };
