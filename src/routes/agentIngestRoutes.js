const express = require("express");
const {
  ingestCoordinateBatch,
  ingestNewsBatch,
  ingestTournamentBatch,
  requireAgentToken
} = require("../controllers/agentIngestController");
const {
  exportPendingTournamentSubmissions,
  updateTournamentSubmissionStatuses
} = require("../controllers/agentCollaborationController");

const router = express.Router();

router.use(requireAgentToken);
router.post("/coordinates", ingestCoordinateBatch);
router.post("/tournaments", ingestTournamentBatch);
router.post("/news", ingestNewsBatch);
router.get("/submissions/tournaments", exportPendingTournamentSubmissions);
router.post("/submissions/tournaments/status", updateTournamentSubmissionStatuses);

module.exports = router;
