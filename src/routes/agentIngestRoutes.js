const express = require("express");
const {
  ingestCoordinateBatch,
  ingestNewsBatch,
  ingestTournamentBatch,
  requireAgentToken
} = require("../controllers/agentIngestController");

const router = express.Router();

router.use(requireAgentToken);
router.post("/coordinates", ingestCoordinateBatch);
router.post("/tournaments", ingestTournamentBatch);
router.post("/news", ingestNewsBatch);

module.exports = router;
