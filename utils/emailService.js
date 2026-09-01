const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendEmail = async (to, subject, text) => {
  try {
    if (!to || !subject || !text) {
      throw new Error("Email 'to', 'subject', and 'text' are required");
    }

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      throw new Error("Email credentials not configured in environment variables");
    }

    const info = await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to,
      subject,
      text,
    });

    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("Email sending error:", error.message);
    return { success: false, error: error.message };
  }
};

const sendNotificationEmail = async (userEmail, userFullName, notificationType, notificationData) => {
  try {
    let subject = "QueueCare Notification";
    let text = "";

    switch (notificationType) {
      case "appointment":
        subject = "Appointment Confirmation - QueueCare";
        text = `Hello ${userFullName || "Patient"},

Your appointment has been booked successfully.

Token Number: ${notificationData.tokenNumber}
Date: ${notificationData.date}
Time Slot: ${notificationData.timeSlot}
Reason: ${notificationData.reason || "Not provided"}

Thank you,
QueueCare Team`;
        break;

      case "queue":
        subject = "Queue Status Update - QueueCare";
        text = `Hello ${userFullName || "User"},

${notificationData.message}

Thank you,
QueueCare Team`;
        break;

      case "reminder":
        subject = "Appointment Reminder - QueueCare";
        text = `Hello ${userFullName || "Patient"},

${notificationData.message}

Thank you,
QueueCare Team`;
        break;

      default:
        subject = "Notification - QueueCare";
        text = notificationData.message || "You have a new notification";
    }

    return await sendEmail(userEmail, subject, text);
  } catch (error) {
    console.error("Notification email error:", error.message);
    return { success: false, error: error.message };
  }
};

module.exports = { sendEmail, sendNotificationEmail };