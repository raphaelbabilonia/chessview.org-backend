const rateLimit = require("express-rate-limit");
const express = require("express");
const {
  createSubmission,
  getOpenApi,
  getSubmissionSchema,
  getSubmissionStatus
} = require("../controllers/agentCollaborationController");

const router = express.Router();

const windowMinutes = Number(process.env.AGENT_COLLABORATION_RATE_LIMIT_WINDOW_MINUTES || 60);
const requestLimit = Number(process.env.AGENT_COLLABORATION_RATE_LIMIT_MAX || 30);

const submissionLimiter = rateLimit({
  windowMs: Math.max(windowMinutes, 1) * 60 * 1000,
  limit: Math.max(requestLimit, 1),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many agent collaboration submissions. Try again later."
  }
});

router.get("/openapi.json", getOpenApi);
router.get("/schema.json", getSubmissionSchema);
router.post("/submissions", submissionLimiter, createSubmission);
router.get("/submissions/:submissionId", getSubmissionStatus);

module.exports = router;
