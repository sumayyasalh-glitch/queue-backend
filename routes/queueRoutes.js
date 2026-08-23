const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { getQueue, callNext } = require("../controller/queueController");

const router = express.Router();

router.use(protect);
router.get("/", getQueue);
router.post("/next", callNext);

module.exports = router;
