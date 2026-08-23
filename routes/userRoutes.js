const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { getCurrentUser, updateCurrentUser, getDoctors, createStaffUser } = require("../controller/userController");

const router = express.Router();

router.get("/doctors", getDoctors);
router.get("/me", protect, getCurrentUser);
router.patch("/me", protect, updateCurrentUser);
router.post("/", protect, createStaffUser);

module.exports = router;
