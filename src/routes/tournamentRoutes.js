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

const router = express.Router();
const manageRoles = [authMiddleware, requireRole("organizer", "admin")];

router.post("/events/:eventId/sections", ...manageRoles, addSection);
router.patch("/sections/:sectionId", ...manageRoles, updateSection);
router.delete("/sections/:sectionId", ...manageRoles, deleteSection);

router.post("/events/:eventId/registrations", authMiddleware, createEventRegistration);
router.get("/events/:eventId/registrations", ...manageRoles, listRegistrations);
router.patch("/registrations/:registrationId/status", ...manageRoles, updateRegistrationStatus);

router.get("/events/:eventId/players", listPlayers);
router.post("/events/:eventId/players", ...manageRoles, addPlayer);
router.patch("/players/:playerId", ...manageRoles, updatePlayer);
router.delete("/players/:playerId", ...manageRoles, deletePlayer);

router.get("/events/:eventId/rounds", listRounds);
router.post("/events/:eventId/rounds", ...manageRoles, addRound);
router.patch("/rounds/:roundId", ...manageRoles, updateRound);

router.get("/rounds/:roundId/pairings", listPairings);
router.post("/rounds/:roundId/pairings", ...manageRoles, addPairing);
router.patch("/pairings/:pairingId/result", ...manageRoles, updatePairingResult);

router.get("/events/:eventId/standings", standingsByEvent);
router.get("/sections/:sectionId/standings", standingsBySection);

module.exports = router;
