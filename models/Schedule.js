const mongoose = require("mongoose");

const scheduleSchema = new mongoose.Schema(
  {
    staff: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    date: {
      type: Date,
      required: true,
    },

    startTime: {
      type: String,
      required: true,
    },

    endTime: {
      type: String,
      required: true,
    },

    isAvailable: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

scheduleSchema.index({ staff: 1, date: 1, startTime: 1, endTime: 1 }, { unique: true });

module.exports = mongoose.model("Schedule", scheduleSchema);
