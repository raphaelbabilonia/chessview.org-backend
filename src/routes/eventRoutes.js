const express = require("express");
const {
  createEvent,
  deleteEvent,
  getEvent,
  listEventCatalog,
  listEvents,
  updateEvent
} = require("../controllers/eventController");
const authMiddleware = require("../middleware/authMiddleware");
const optionalAuthMiddleware = require("../middleware/optionalAuthMiddleware");
const requireRole = require("../middleware/roleMiddleware");
const validate = require("../middleware/validate");
const validateObjectId = require("../middleware/validateObjectId");
const { createEventSchema, updateEventSchema } = require("../validation/eventSchemas");

const router = express.Router();

const authWhenMine = (req, res, next) => {
  if (req.query.mine === "true") return authMiddleware(req, res, next);
  return next();
};

router.get("/", authWhenMine, listEvents);
router.get("/catalog", listEventCatalog);
router.get("/:id", optionalAuthMiddleware, getEvent);
router.post("/", authMiddleware, requireRole("organizer", "admin"), validate(createEventSchema), createEvent);
router.patch("/:id", authMiddleware, requireRole("organizer", "admin"), validateObjectId("id"), validate(updateEventSchema), updateEvent);
router.delete("/:id", authMiddleware, requireRole("organizer", "admin"), validateObjectId("id"), deleteEvent);

module.exports = router;
