const { ingestNews, ingestTournaments } = require("../services/agentIngestService");

const requireAgentToken = (req, res, next) => {
  const configuredToken = process.env.AGENT_PUBLISH_TOKEN;
  if (!configuredToken) {
    return res.status(503).json({
      success: false,
      message: "Agent ingest is not configured"
    });
  }

  const providedToken = req.get("X-Agent-Publish-Token") || "";
  if (providedToken !== configuredToken) {
    return res.status(401).json({
      success: false,
      message: "Invalid agent publish token"
    });
  }

  next();
};

const normalizeBatch = (req) => ({
  dryRun: req.body?.dryRun === true,
  runId: typeof req.body?.runId === "string" ? req.body.runId : "",
  items: Array.isArray(req.body?.items) ? req.body.items : []
});

const sendIngestResult = (res, { runId, dryRun, result }) =>
  res.json({
    success: result.errors.length === 0,
    runId,
    dryRun,
    created: result.created,
    updated: result.updated,
    skipped: result.skipped,
    rejected: result.rejected,
    errors: result.errors,
    meta: {
      created: result.created.length,
      updated: result.updated.length,
      skipped: result.skipped.length,
      rejected: result.rejected.length,
      errors: result.errors.length
    }
  });

const ingestTournamentBatch = async (req, res, next) => {
  try {
    const { dryRun, runId, items } = normalizeBatch(req);
    const result = await ingestTournaments({ items, dryRun });
    return sendIngestResult(res, { runId, dryRun, result });
  } catch (error) {
    return next(error);
  }
};

const ingestNewsBatch = async (req, res, next) => {
  try {
    const { dryRun, runId, items } = normalizeBatch(req);
    const result = await ingestNews({ items, dryRun });
    return sendIngestResult(res, { runId, dryRun, result });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  ingestNewsBatch,
  ingestTournamentBatch,
  requireAgentToken
};

