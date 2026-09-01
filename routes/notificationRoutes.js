const express = require("express");
const {
  createNotification,
  getNotifications,
  markAsRead,
  testEmail,
} = require("../controller/notificationController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/", protect, createNotification);
router.get("/", protect, getNotifications);
router.patch("/:id/read", protect, markAsRead);
router.post("/test/email", testEmail);

module.exports = router;