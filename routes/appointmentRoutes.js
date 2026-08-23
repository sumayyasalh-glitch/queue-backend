const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { createAppointment, getAppointments, getAppointment, updateAppointment } = require("../controller/appointmentController");

const router = express.Router();

router.use(protect);
router.route("/").post(createAppointment).get(getAppointments);
router.route("/:id").get(getAppointment).patch(updateAppointment);

module.exports = router;
