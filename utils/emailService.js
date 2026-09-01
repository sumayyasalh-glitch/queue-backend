const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  requireTLS: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Verify transporter connection on startup
transporter.verify((error, success) => {
  if (error) {
    console.error("❌ Email transporter error:", error.message);
  } else {
    console.log("✓ Email transporter is ready to send messages");
  }
});

const sendEmail = async (to, subject, text) => {
  try {
    if (!to || !subject || !text) {
      throw new Error("Email 'to', 'subject', and 'text' are required");
    }

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      throw new Error("Email credentials not configured in environment variables");
    }

    console.log(`📧 Attempting to send email to: ${to}`);

    const info = await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to,
      subject,
      html: `<html><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">${text.replace(/\n/g, '<br>')}</body></html>`,
      text,
    });

    console.log(`✓ Email sent successfully. Message ID: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`❌ Email sending error: ${error.message}`);
    console.error(`Error details:`, error);
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