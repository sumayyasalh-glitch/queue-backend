const Appointment = require("../models/Appointments");
const Queue = require("../models/Queue");
const User = require("../models/User");
const Notification = require("../models/Notification");
const { sendEmail } = require("../utils/emailService");

const privilegedRoles = ["admin", "staff"];
const queuedStatuses = ["Pending", "Confirmed", "Waiting"];

const dateOnly = (value) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  date.setUTCHours(0, 0, 0, 0);
  return date;
};

const canManage = (user) =>
  privilegedRoles.includes(user.role);

const canAccess = (appointment, user) =>
  canManage(user) ||
  appointment.patient._id?.toString() === user.id ||
  appointment.patient.toString() === user.id ||
  appointment.doctor._id?.toString() === user.id ||
  appointment.doctor.toString() === user.id;

const updateQueueCount = (doctor, date, amount) =>
  Queue.updateOne(
    { doctor, date },
    { $inc: { waitingCount: amount } }
  );


// ======================================================
// CREATE APPOINTMENT
// ======================================================

const createAppointment = async (req, res, next) => {
  try {
    if (req.user.role !== "patient") {
      return res.status(403).json({
        message: "Only patients can book appointments"
      });
    }

    const { doctor, date, timeSlot, reason } = req.body;

    const appointmentDate = dateOnly(date);

    if (!doctor || !appointmentDate || !timeSlot) {
      return res.status(400).json({
        message: "doctor, date, and timeSlot are required"
      });
    }

    // Check doctor
    const doctorUser = await User.findOne({
      _id: doctor,
      role: "doctor"
    });

    if (!doctorUser) {
      return res.status(404).json({
        message: "Doctor not found"
      });
    }

    // Get patient details for email
    const patientUser = await User.findById(req.user.id);

    if (!patientUser) {
      return res.status(404).json({
        message: "Patient not found"
      });
    }

    // Generate queue token
    const queue = await Queue.findOneAndUpdate(
      {
        doctor,
        date: appointmentDate
      },
      {
        $inc: {
          lastToken: 1,
          waitingCount: 1
        },
        $setOnInsert: {
          currentToken: 0
        }
      },
      {
        new: true,
        upsert: true,
        runValidators: true
      }
    );

    try {

      // Create appointment
      const appointment = await Appointment.create({
        patient: req.user.id,
        doctor,
        date: appointmentDate,
        timeSlot,
        reason,
        tokenNumber: queue.lastToken,
        status: "Pending"
      });


      // ==================================================
      // IN-APP NOTIFICATION
      // ==================================================

      await Notification.create({
  user: req.user.id,
  type: "appointment",
  message: `Appointment booked. Your token number is ${appointment.tokenNumber}.`
});

      // ==================================================
      // SEND EMAIL NOTIFICATIONS
      // ==================================================

      // Send appointment confirmation to patient
      if (patientUser && patientUser.email && patientUser.role === "patient") {
        sendEmail(
          patientUser.email,
          "Appointment Confirmation - QueueCare",
          `Hello ${patientUser.fullName || "Patient"},

Your appointment has been booked successfully.

Token Number: ${appointment.tokenNumber}
Date: ${appointment.date.toISOString().split("T")[0]}
Time Slot: ${appointment.timeSlot}
Reason: ${appointment.reason || "Not provided"}

Thank you,
QueueCare Team`
        )
          .then((result) => {
            if (result.success) {
              console.log("Appointment confirmation email sent to patient successfully.");
            } else {
              console.error("Failed to send patient email:", result.error);
            }
          })
          .catch((emailError) => {
            console.error("Patient email sending error:", emailError.message);
          });
      }

      // Send appointment notification to doctor
      if (doctorUser && doctorUser.email) {
        sendEmail(
          doctorUser.email,
          "New Appointment - QueueCare",
          `Hello ${doctorUser.fullName || "Doctor"},

A new appointment has been booked.

Patient: ${patientUser.fullName || "Patient"}
Token Number: ${appointment.tokenNumber}
Date: ${appointment.date.toISOString().split("T")[0]}
Time Slot: ${appointment.timeSlot}
Reason: ${appointment.reason || "Not provided"}

Please check your QueueCare dashboard.

Thank you,
QueueCare Team`
        )
          .then((result) => {
            if (result.success) {
              console.log("Appointment notification email sent to doctor successfully.");
            } else {
              console.error("Failed to send doctor email:", result.error);
            }
          })
          .catch((emailError) => {
            console.error("Doctor email sending error:", emailError.message);
          });
      }

      // ==================================================
      // SUCCESS RESPONSE
      // ==================================================

      return res.status(201).json({
        message: "Appointment created",
        appointment
      });


    } catch (error) {

      // Roll back queue if appointment creation fails
      await Queue.updateOne(
        {
          _id: queue._id,
          lastToken: queue.lastToken
        },
        {
          $inc: {
            lastToken: -1,
            waitingCount: -1
          }
        }
      );

      if (error?.code === 11000) {
        return res.status(409).json({
          message:
            "This doctor already has an appointment in that time slot"
        });
      }

      throw error;
    }

  } catch (error) {
    next(error);
  }
};


// ======================================================
// GET APPOINTMENTS
// ======================================================

const getAppointments = async (req, res, next) => {
  try {

    const filter = {};

    if (req.user.role === "patient") {
      filter.patient = req.user.id;
    }

    if (req.user.role === "doctor") {
      filter.doctor = req.user.id;
    }

    if (
      req.query.doctor &&
      req.user.role !== "doctor"
    ) {
      filter.doctor = req.query.doctor;
    }

    if (
      req.query.patient &&
      canManage(req.user)
    ) {
      filter.patient = req.query.patient;
    }

    if (req.query.status) {
      filter.status = req.query.status;
    }

    if (req.query.date) {

      const day = dateOnly(req.query.date);

      if (!day) {
        return res.status(400).json({
          message: "Invalid date"
        });
      }

      const nextDay = new Date(day);

      nextDay.setUTCDate(
        day.getUTCDate() + 1
      );

      filter.date = {
        $gte: day,
        $lt: nextDay
      };
    }


    const appointments = await Appointment.find(filter)
      .populate(
        "patient",
        "fullName email"
      )
      .populate(
        "doctor",
        "fullName email"
      )
      .sort({
        date: 1,
        timeSlot: 1
      });


    res.json({
      appointments
    });

  } catch (error) {
    next(error);
  }
};


// ======================================================
// GET SINGLE APPOINTMENT
// ======================================================

const getAppointment = async (req, res, next) => {
  try {

    const appointment =
      await Appointment.findById(req.params.id)
        .populate(
          "patient",
          "fullName email"
        )
        .populate(
          "doctor",
          "fullName email"
        );


    if (!appointment) {
      return res.status(404).json({
        message: "Appointment not found"
      });
    }


    if (
      !canAccess(
        appointment,
        req.user
      )
    ) {
      return res.status(403).json({
        message: "Not authorized"
      });
    }


    res.json({
      appointment
    });

  } catch (error) {
    next(error);
  }
};


// ======================================================
// UPDATE APPOINTMENT
// ======================================================

const updateAppointment = async (
  req,
  res,
  next
) => {

  try {

    const appointment =
      await Appointment.findById(
        req.params.id
      );


    if (!appointment) {
      return res.status(404).json({
        message: "Appointment not found"
      });
    }


    if (
      !canAccess(
        appointment,
        req.user
      )
    ) {
      return res.status(403).json({
        message: "Not authorized"
      });
    }


    const isPatient =
      appointment.patient.toString() ===
      req.user.id;


    const originalDate =
      new Date(appointment.date);


    const originalStatus =
      appointment.status;


    const allowed = isPatient
      ? [
          "date",
          "timeSlot",
          "reason",
          "status"
        ]
      : req.user.role === "doctor"
      ? ["status"]
      : [
          "date",
          "timeSlot",
          "reason",
          "status"
        ];


    for (const key of allowed) {

      if (req.body[key] !== undefined) {

        appointment[key] =
          key === "date"
            ? dateOnly(req.body[key])
            : req.body[key];

      }
    }


    if (
      req.body.date !== undefined &&
      !appointment.date
    ) {
      return res.status(400).json({
        message: "Invalid date"
      });
    }


    if (
      isPatient &&
      req.body.status &&
      req.body.status !== "Cancelled"
    ) {
      return res.status(403).json({
        message:
          "Patients can only cancel appointments"
      });
    }


    if (
      isPatient &&
      !queuedStatuses.includes(
        originalStatus
      ) &&
      (
        req.body.date !== undefined ||
        req.body.timeSlot !== undefined
      )
    ) {
      return res.status(409).json({
        message:
          "Only appointments waiting in the queue can be rescheduled"
      });
    }


    const wasQueued =
      queuedStatuses.includes(
        originalStatus
      );


    const isQueued =
      queuedStatuses.includes(
        appointment.status
      );


    const movedDate =
      originalDate.getTime() !==
      appointment.date.getTime();


    if (movedDate) {

      if (wasQueued) {

        await updateQueueCount(
          appointment.doctor,
          originalDate,
          -1
        );

      }


      if (isQueued) {

        const newQueue =
          await Queue.findOneAndUpdate(
            {
              doctor:
                appointment.doctor,
              date:
                appointment.date
            },
            {
              $inc: {
                lastToken: 1,
                waitingCount: 1
              },
              $setOnInsert: {
                currentToken: 0
              }
            },
            {
              new: true,
              upsert: true,
              runValidators: true
            }
          );


        appointment.tokenNumber =
          newQueue.lastToken;

      }

    } else if (
      !movedDate &&
      wasQueued !== isQueued
    ) {

      await updateQueueCount(
        appointment.doctor,
        appointment.date,
        isQueued ? 1 : -1
      );

    }


    await appointment.save();

    // ==================================================
    // SEND EMAIL & IN-APP NOTIFICATION
    // ==================================================

    // Create in-app notification for patient
    await Notification.create({
      user: appointment.patient,
      type: "appointment",
      message: `Your appointment status is now ${appointment.status}.`
    });

    // Fetch patient details for email
    const patientUser = await User.findById(appointment.patient);
    const doctorUser = await User.findById(appointment.doctor);

    // Send email to patient about status change
    if (patientUser && patientUser.email) {
      const statusMessage = appointment.status === "Cancelled" 
        ? "Your appointment has been cancelled."
        : appointment.status === "Confirmed"
        ? "Your appointment has been confirmed."
        : appointment.status === "In Consultation"
        ? "You are now being attended. Please proceed to the consultation room."
        : appointment.status === "Completed"
        ? "Your appointment is now complete."
        : `Your appointment status is now ${appointment.status}.`;

      sendEmail(
        patientUser.email,
        `Appointment Status Update - QueueCare`,
        `Hello ${patientUser.fullName || "Patient"},

${statusMessage}

Appointment Details:
Date: ${appointment.date.toISOString().split("T")[0]}
Time Slot: ${appointment.timeSlot}
Doctor: ${doctorUser?.fullName || "Doctor"}
Status: ${appointment.status}
${appointment.tokenNumber ? `Token Number: ${appointment.tokenNumber}` : ""}

Thank you,
QueueCare Team`
      )
        .then((result) => {
          if (!result.success) {
            console.error(`Failed to send patient update email: ${result.error}`);
          }
        })
        .catch((error) => {
          console.error("Patient update email error:", error.message);
        });
    }

    // Notify doctor if status changed
    if (originalStatus !== appointment.status && doctorUser && doctorUser.email) {
      sendEmail(
        doctorUser.email,
        `Appointment Status Updated - QueueCare`,
        `Hello ${doctorUser.fullName || "Doctor"},

An appointment status has been updated.

Patient: ${patientUser?.fullName || "Patient"}
Date: ${appointment.date.toISOString().split("T")[0]}
Time Slot: ${appointment.timeSlot}
New Status: ${appointment.status}
Token Number: ${appointment.tokenNumber}

Please check your QueueCare dashboard for more details.

Thank you,
QueueCare Team`
      )
        .then((result) => {
          if (!result.success) {
            console.error(`Failed to send doctor update email: ${result.error}`);
          }
        })
        .catch((error) => {
          console.error("Doctor update email error:", error.message);
        });
    }

    res.json({
      message: "Appointment updated",
      appointment
    });


  } catch (error) {

    if (error?.code === 11000) {
      return res.status(409).json({
        message:
          "This doctor already has an appointment in that time slot"
      });
    }

    next(error);
  }
};


// ======================================================
// EXPORT
// ======================================================

module.exports = {
  createAppointment,
  getAppointments,
  getAppointment,
  updateAppointment
};