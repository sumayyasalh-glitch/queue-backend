const mongoose = require("mongoose");

const appointmentSchema = new mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },

    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    date: {
      type: Date,
      required: true,
    },

    timeSlot: {
      type: String,
      required: true,
    },

    reason: {
      type: String,
      trim: true,
    },

    // The signed-in patient owns the booking. These fields identify a family
    // member when the account holder books care on their behalf.
    patientName: {
      type: String,
      trim: true,
    },

    patientContact: {
      type: String,
      trim: true,
    },

    relationship: {
      type: String,
      trim: true,
    },

    paymentMethod: {
      type: String,
      enum: ["Pay at Hospital"],
      default: "Pay at Hospital",
    },

    paymentStatus: {
      type: String,
      enum: ["Pending", "Paid"],
      default: "Pending",
    },

    status: {
      type: String,
      enum: ["Pending", "Confirmed", "Waiting", "In Consultation", "Completed", "Cancelled", "No Show"],
      default: "Pending",
    },

    tokenNumber: {
      type: Number,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

appointmentSchema.index({ doctor: 1, date: 1, timeSlot: 1 }, { unique: true });
appointmentSchema.index({ patient: 1, date: 1 });

module.exports = mongoose.model("Appointment", appointmentSchema);
