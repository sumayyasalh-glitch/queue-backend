const mongoose = require("mongoose");

const queueSchema = new mongoose.Schema(
  {
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    date: {
      type: Date,
      required: true,
    },

    currentToken: {
      type: Number,
      default: 0,
    },

    lastToken: {
      type: Number,
      default: 0,
    },

    waitingCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

queueSchema.index({ doctor: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("Queue", queueSchema);
