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
const optionalAuthMiddleware = require("../middleware/optionalAuthMiddleware");
const requireRole = require("../middleware/roleMiddleware");
const validate = require("../middleware/validate");
const validateObjectId = require("../middleware/validateObjectId");
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

router.post("/events/:eventId/sections", ...manageRoles, validateObjectId("eventId"), validate(createSectionSchema), addSection);
router.patch("/sections/:sectionId", ...manageRoles, validateObjectId("sectionId"), validate(updateSectionSchema), updateSection);
router.delete("/sections/:sectionId", ...manageRoles, validateObjectId("sectionId"), deleteSection);

router.post("/events/:eventId/registrations", authMiddleware, validateObjectId("eventId"), validate(createRegistrationSchema), createEventRegistration);
router.get("/events/:eventId/registrations", ...manageRoles, validateObjectId("eventId"), listRegistrations);
router.patch("/registrations/:registrationId/status", ...manageRoles, validateObjectId("registrationId"), validate(updateRegistrationStatusSchema), updateRegistrationStatus);

router.get("/events/:eventId/players", optionalAuthMiddleware, validateObjectId("eventId"), listPlayers);
router.post("/events/:eventId/players", ...manageRoles, validateObjectId("eventId"), validate(createPlayerSchema), addPlayer);
router.patch("/players/:playerId", ...manageRoles, validateObjectId("playerId"), validate(updatePlayerSchema), updatePlayer);
router.delete("/players/:playerId", ...manageRoles, validateObjectId("playerId"), deletePlayer);

router.get("/events/:eventId/rounds", optionalAuthMiddleware, validateObjectId("eventId"), listRounds);
router.post("/events/:eventId/rounds", ...manageRoles, validateObjectId("eventId"), validate(createRoundSchema), addRound);
router.patch("/rounds/:roundId", ...manageRoles, validateObjectId("roundId"), validate(updateRoundSchema), updateRound);

router.get("/rounds/:roundId/pairings", optionalAuthMiddleware, validateObjectId("roundId"), listPairings);
router.post("/rounds/:roundId/pairings", ...manageRoles, validateObjectId("roundId"), validate(createPairingSchema), addPairing);
router.patch("/pairings/:pairingId/result", ...manageRoles, validateObjectId("pairingId"), validate(updatePairingResultSchema), updatePairingResult);

router.get("/events/:eventId/standings", optionalAuthMiddleware, validateObjectId("eventId"), standingsByEvent);
router.get("/sections/:sectionId/standings", optionalAuthMiddleware, validateObjectId("sectionId"), standingsBySection);

module.exports = router;
