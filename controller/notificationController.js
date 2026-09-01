const Notification = require("../models/Notification");
const User = require("../models/User");
const { sendNotificationEmail } = require("../utils/emailService");

const createNotification = async (req, res) => {
  try {
    const { type, message, recipientId, sendEmail: shouldSendEmail } = req.body;

    if (!type || !message) {
      return res.status(400).json({ message: "type and message are required" });
    }

    const userId = recipientId || req.user.id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const notification = await Notification.create({
      user: userId,
      type,
      message,
    });

    // Send email notification if requested and user has email
    if (shouldSendEmail && user.email) {
      sendNotificationEmail(user.email, user.fullName, type, { message })
        .then((result) => {
          if (!result.success) {
            console.error(`Failed to send email for notification: ${result.error}`);
          }
        })
        .catch((error) => {
          console.error("Error sending notification email:", error.message);
        });
    }

    res.status(201).json({
      message: "Notification created",
      notification,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to create notification",
      error: error.message,
    });
  }
};

const getNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({
      user: req.user.id,
    }).sort({ createdAt: -1 });

    res.json(notifications);
  } catch (error) {
    res.status(500).json({
      message: "Failed to get notifications",
      error: error.message,
    });
  }
};

const markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      { isRead: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({
        message: "Notification not found",
      });
    }

    res.json(notification);
  } catch (error) {
    res.status(500).json({
      message: "Failed to update notification",
      error: error.message,
    });
  }
};

module.exports = {
  createNotification,
  getNotifications,
  markAsRead,
};
