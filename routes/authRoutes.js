const express = require("express");
const { register, login } = require("../controller/authController");
const { protect } = require("../middleware/authMiddleware");
const { getCurrentUser } = require("../controller/userController");

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.get("/me", protect, getCurrentUser);

module.exports = router;
