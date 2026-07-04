const express = require("express");
const { getDashboard, ingestEvents } = require("../controllers/trackingController");

const router = express.Router();

router.post("/events", ingestEvents);
router.get("/dashboard/:code", getDashboard);

module.exports = router;
