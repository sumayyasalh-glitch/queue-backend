const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { createSchedule, getSchedules, updateSchedule, deleteSchedule } = require("../controller/scheduleController");

const router = express.Router();

router.use(protect);
router.route("/").post(createSchedule).get(getSchedules);
router.route("/:id").patch(updateSchedule).delete(deleteSchedule);

module.exports = router;
