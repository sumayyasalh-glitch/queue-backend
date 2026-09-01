const Appointment = require("../models/Appointments");
const Queue = require("../models/Queue");
const User = require("../models/User");
const Notification = require("../models/Notification");
const { sendEmail } = require("../utils/emailService");

const privilegedRoles = ["admin", "staff"];
const queuedStatuses = ["Pending", "Confirmed", "Waiting"];


// ======================================================
// HELPERS
// ======================================================

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
  appointment.patient?._id?.toString() === user.id ||
  appointment.patient?.toString() === user.id ||
  appointment.doctor?._id?.toString() === user.id ||
  appointment.doctor?.toString() === user.id;

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

    const {
      doctor,
      date,
      timeSlot,
      reason
    } = req.body;

    const appointmentDate = dateOnly(date);

    if (!doctor || !appointmentDate || !timeSlot) {
      return res.status(400).json({
        message: "doctor, date, and timeSlot are required"
      });
    }


    // ==================================================
    // FIND DOCTOR
    // ==================================================

    const doctorUser = await User.findOne({
      _id: doctor,
      role: "doctor"
    });

    if (!doctorUser) {
      return res.status(404).json({
        message: "Doctor not found"
      });
    }


    // ==================================================
    // FIND PATIENT
    // ==================================================

    const patientUser = await User.findById(
      req.user.id
    );

    if (!patientUser) {
      return res.status(404).json({
        message: "Patient not found"
      });
    }


    // ==================================================
    // GENERATE QUEUE TOKEN
    // ==================================================

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

      // ==================================================
      // CREATE APPOINTMENT
      // ==================================================

      const appointment =
        await Appointment.create({
          patient: req.user.id,
          doctor,
          date: appointmentDate,
          timeSlot,
          reason,
          tokenNumber: queue.lastToken,
          status: "Pending"
        });


      // ==================================================
      // PATIENT IN-APP NOTIFICATION
      // ==================================================

      await Notification.create({
        user: req.user.id,
        type: "appointment",
        message:
         `Appointment booked. Your token number is ${appointment.tokenNumber}.`
      });


      // ==================================================
      // EMAIL DATE
      // ==================================================

      const formattedDate =
        appointment.date
          .toISOString()
          .split("T")[0];


      // ==================================================
      // PATIENT EMAIL
      // ==================================================

      if (patientUser.email) {

        sendEmail(
          patientUser.email,

          "Appointment Confirmation - QueueCare",

          `Hello ${patientUser.fullName || "Patient"},

Your appointment has been booked successfully.

Appointment Details:

Token Number: ${appointment.tokenNumber}
Date: ${formattedDate}
Time Slot: ${appointment.timeSlot}
Doctor: ${doctorUser.fullName || "Doctor"}
Reason: ${appointment.reason || "Not provided"}
Status: ${appointment.status

}

Thank you,
QueueCare Team`
        )
          .then((result) => {

            if (result?.success) {

              console.log(
                `Patient email sent: ${patientUser.email}`
              );

            } else {

              console.error(
                `Patient email failed: ${result?.error || "Unknown error"}`
              );

            }

          })
          .catch((error) => {

            console.error(
              `Patient email error: ${error.message}`
            );

          });

      } else {

        console.warn(
          `Patient email not found: ${patientUser.email}`
        );

      }


      // ==================================================
      // DOCTOR EMAIL
      // ==================================================

      if (doctorUser.email) {

        sendEmail(
          doctorUser.email,

          "New Appointment - QueueCare",

          `Hello ${doctorUser.fullName || "Doctor"},

A new appointment has been booked.

Appointment Details:

Patient: ${patientUser.fullName || "Patient"}
Token Number: ${appointment.tokenNumber}
Date: ${formattedDate}
Time Slot: ${appointment.timeSlot}
Reason: ${appointment.reason || "Not provided"}
Status: ${appointment.status}

Please check your QueueCare dashboard.

Thank you,
QueueCare Team`
        )
          .then((result) => {

            if (result?.success) {

              console.log(
                `Doctor email sent: ${doctorUser.email}`
              );

            } else {

              console.error(
                `Doctor email failed: ${result?.error || "Unknown error"}`
              );

            }

          })
          .catch((error) => {

            console.error(
              `Doctor email error: ${error.message}`
            );

          });

      } else {

        console.warn(
          `Doctor email not found: ${doctorUser.email}`
        );

      }


      // ==================================================
      // SUCCESS
      // ==================================================

      return res.status(201).json({
        message: "Appointment created",
        appointment
      });


    } catch (error) {

      // ==================================================
      // ROLLBACK QUEUE
      // ==================================================

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

const getAppointments = async (
  req,
  res,
  next
) => {

  try {

    const filter = {};


    // Patient sees own appointments
    if (req.user.role === "patient") {
      filter.patient = req.user.id;
    }


    // Doctor sees own appointments
    if (req.user.role === "doctor") {
      filter.doctor = req.user.id;
    }


    // Admin/staff can filter by doctor
    if (
      req.query.doctor &&
      req.user.role !== "doctor"
    ) {
      filter.doctor = req.query.doctor;
    }


    // Admin/staff can filter by patient
    if (
      req.query.patient &&
      canManage(req.user)
    ) {
      filter.patient = req.query.patient;
    }


    // Status filter
    if (req.query.status) {
      filter.status = req.query.status;
    }


    // Date filter
    if (req.query.date) {

      const day =
        dateOnly(req.query.date);

      if (!day) {

        return res.status(400).json({
          message: "Invalid date"
        });

      }

      const nextDay =
        new Date(day);

      nextDay.setUTCDate(
        day.getUTCDate() + 1
      );

      filter.date = {
        $gte: day,
        $lt: nextDay
      };

    }


    const appointments =
      await Appointment.find(filter)
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


    return res.json({
      appointments
    });


  } catch (error) {

    next(error);

  }
};


// ======================================================
// GET SINGLE APPOINTMENT
// ======================================================

const getAppointment = async (
  req,
  res,
  next
) => {

  try {

    const appointment =
      await Appointment.findById(
        req.params.id
      )
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


    return res.json({
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


    // ==================================================
    // CHECK PATIENT
    // ==================================================

    const isPatient =
      appointment.patient.toString() ===
      req.user.id;


    const originalDate =
      new Date(appointment.date);


    const originalStatus =
      appointment.status;


    // ==================================================
    // ALLOWED FIELDS
    // ==================================================

    const allowed = isPatient
      ? [
          "date",
          "timeSlot",
          "reason",
          "status"
        ]
      : req.user.role === "doctor"
      ? [
          "status"
        ]
      : [
          "date",
          "timeSlot",
          "reason",
          "status"
        ];


    // ==================================================
    // UPDATE FIELDS
    // ==================================================

    for (const key of allowed) {

      if (req.body[key] !== undefined) {

        appointment[key] =
          key === "date"
            ? dateOnly(req.body[key])
            : req.body[key];

      }

    }


    // ==================================================
    // DATE VALIDATION
    // ==================================================

    if (
      req.body.date !== undefined &&
      !appointment.date
    ) {

      return res.status(400).json({
        message: "Invalid date"
      });

    }


    // ==================================================
    // PATIENT STATUS RESTRICTION
    // ==================================================

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


    // ==================================================
    // RESCHEDULE RESTRICTION
    // ==================================================

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


    // ==================================================
    // QUEUE STATUS
    // ==================================================

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
      new Date(appointment.date).getTime();


    // ==================================================
    // QUEUE DATE CHANGED
    // ==================================================

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

    }

    // ==================================================
    // QUEUE STATUS CHANGED
    // ==================================================

    else if (
      wasQueued !== isQueued
    ) {

      await updateQueueCount(
        appointment.doctor,
        appointment.date,
        isQueued ? 1 : -1
      );
}


    // ==================================================
    // SAVE APPOINTMENT
    // ==================================================

    await appointment.save();


    // ==================================================
    // FETCH USERS
    // ==================================================

    const patientUser =
      await User.findById(
        appointment.patient
      );

    const doctorUser =
      await User.findById(
        appointment.doctor
      );
    

    // ==================================================
    // PATIENT IN-APP NOTIFICATION
    // ==================================================

    await Notification.create({
      user: appointment.patient,
      type: "appointment",
      message:
        `Your appointment status is now ${appointment.status}.`
    });


    // ==================================================
    // STATUS MESSAGE
    // ==================================================

    const statusMessage =
      appointment.status === "Cancelled"
        ? "Your appointment has been cancelled."
        : appointment.status === "Confirmed"
        ? "Your appointment has been confirmed."
        : appointment.status === "In Consultation"
        ? "You are now being attended. Please proceed to the consultation room."
        : appointment.status === "Completed"
        ? "Your appointment is now complete."
        : `Your appointment status is now ${appointment.status}.`;


    // ==================================================
    // FORMATTED DATE
    // ==================================================

    const formattedDate =
      new Date(appointment.date)
        .toISOString()
        .split("T")[0];


    // ==================================================
    // PATIENT STATUS EMAIL
    // ==================================================

    if (patientUser?.email) {

      sendEmail(
        patientUser.email,

        "Appointment Status Update - QueueCare",

        `Hello ${patientUser.fullName || "Patient"},

${statusMessage}

Appointment Details:

Date: ${formattedDate}
Time Slot: ${appointment.timeSlot}
Doctor: ${doctorUser?.fullName || "Doctor"}
Status: ${appointment.status}
${appointment.tokenNumber
  ? `Token Number: ${appointment.tokenNumber}`
  : ""}

Thank you,
QueueCare Team`
      )
        .then((result) => {

          if (result?.success) {

            console.log(
             `Patient status email sent: ${patientUser.email}`
            );

          } else {

            console.error(
              `Patient status email failed: ${result?.error || "Unknown error"}`
            );

          }

        })
        .catch((error) => {

          console.error(
            `Patient status email error: ${error.message}`
          );

        });

    } else {

      console.warn(
        `Patient email not found for status update: ${patientUser?.email}`
      );

    }


    // ==================================================
    // DOCTOR STATUS EMAIL
    // ==================================================

    if (
      originalStatus !== appointment.status &&
      doctorUser?.email
    ) {

      sendEmail(
        doctorUser.email,

        "Appointment Status Updated - QueueCare",

        `Hello ${doctorUser.fullName || "Doctor"},

An appointment status has been updated.

Appointment Details:

Patient: ${patientUser?.fullName || "Patient"}
Date: ${formattedDate}
Time Slot: ${appointment.timeSlot}
New Status: ${appointment.status}
Token Number: ${appointment.tokenNumber || "N/A"}

Please check your QueueCare dashboard for more details.

Thank you,
QueueCare Team`
      )
        .then((result) => {

          if (result?.success) {

            console.log(
              `Doctor status email sent: ${doctorUser.email}`
            );

          } else {

            console.error(
             `Doctor status email failed: ${result?.error || "Unknown error"}`
            );

          }

        })
        .catch((error) => {

          console.error(
            `Doctor status email error: ${error.message}`
          );

        });

    }


    // ==================================================
    // SUCCESS RESPONSE
    // ==================================================

    return res.json({
      message: "Appointment updated",
      appointment
    });


  } catch (error) {

    // ==================================================
    // DUPLICATE APPOINTMENT
    // ==================================================

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