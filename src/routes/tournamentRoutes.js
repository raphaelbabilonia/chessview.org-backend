const express = require("express");
const {
  addPairing,
  listPairings,
  updatePairingResult
} = require("../controllers/pairingController");
const { addPlayer, deletePlayer, listPlayers, updatePlayer } = require("../controllers/playerController");
const {
  createEventRegistration,
  listRegistrations,
  updateRegistrationStatus
} = require("../controllers/registrationController");
const { addRound, listRounds, updateRound } = require("../controllers/roundController");
const { addSection, deleteSection, updateSection } = require("../controllers/sectionController");
const { standingsByEvent, standingsBySection } = require("../controllers/standingsController");
const authMiddleware = require("../middleware/authMiddleware");
const requireRole = require("../middleware/roleMiddleware");
const validate = require("../middleware/validate");
const { createSectionSchema, updateSectionSchema } = require("../validation/sectionSchemas");
const { createRoundSchema, updateRoundSchema } = require("../validation/roundSchemas");
const { createPlayerSchema, updatePlayerSchema } = require("../validation/playerSchemas");
const { createPairingSchema, updatePairingResultSchema } = require("../validation/pairingSchemas");
const {
  createRegistrationSchema,
  updateRegistrationStatusSchema
} = require("../validation/registrationSchemas");

const router = express.Router();
const manageRoles = [authMiddleware, requireRole("organizer", "admin")];

router.post("/events/:eventId/sections", ...manageRoles, validate(createSectionSchema), addSection);
router.patch("/sections/:sectionId", ...manageRoles, validate(updateSectionSchema), updateSection);
router.delete("/sections/:sectionId", ...manageRoles, deleteSection);

router.post("/events/:eventId/registrations", authMiddleware, validate(createRegistrationSchema), createEventRegistration);
router.get("/events/:eventId/registrations", ...manageRoles, listRegistrations);
router.patch("/registrations/:registrationId/status", ...manageRoles, validate(updateRegistrationStatusSchema), updateRegistrationStatus);

router.get("/events/:eventId/players", listPlayers);
router.post("/events/:eventId/players", ...manageRoles, validate(createPlayerSchema), addPlayer);
router.patch("/players/:playerId", ...manageRoles, validate(updatePlayerSchema), updatePlayer);
router.delete("/players/:playerId", ...manageRoles, deletePlayer);

router.get("/events/:eventId/rounds", listRounds);
router.post("/events/:eventId/rounds", ...manageRoles, validate(createRoundSchema), addRound);
router.patch("/rounds/:roundId", ...manageRoles, validate(updateRoundSchema), updateRound);

router.get("/rounds/:roundId/pairings", listPairings);
router.post("/rounds/:roundId/pairings", ...manageRoles, validate(createPairingSchema), addPairing);
router.patch("/pairings/:pairingId/result", ...manageRoles, validate(updatePairingResultSchema), updatePairingResult);

router.get("/events/:eventId/standings", standingsByEvent);
router.get("/sections/:sectionId/standings", standingsBySection);

module.exports = router;
