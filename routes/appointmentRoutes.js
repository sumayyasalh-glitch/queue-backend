const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { createAppointment, getAppointments, getAppointment, updateAppointment } = require("../controller/appointmentController");

const router = express.Router();

router.route("/").post(protect, createAppointment).get(protect, getAppointments);
router.route("/:id").get(protect, getAppointment).patch(protect, updateAppointment);

module.exports = router;
