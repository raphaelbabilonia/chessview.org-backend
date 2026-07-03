const express = require("express");
const {
  ingestNewsBatch,
  ingestTournamentBatch,
  requireAgentToken
} = require("../controllers/agentIngestController");

const router = express.Router();

router.use(requireAgentToken);
router.post("/tournaments", ingestTournamentBatch);
router.post("/news", ingestNewsBatch);

module.exports = router;

