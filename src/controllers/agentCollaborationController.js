const AgentSubmission = require("../models/AgentSubmission");
const { openApiDocument, submissionJsonSchema } = require("../services/agentCollaborationDocs");
const { publicSubmissionStatus, queuePublicSubmissions } = require("../services/agentCollaborationService");
const { publicSubmissionSchema } = require("../validation/agentCollaborationSchemas");

const MAX_BATCH_BYTES = Number(process.env.AGENT_COLLABORATION_MAX_BATCH_BYTES || 250000);

const createSubmission = async (req, res, next) => {
  try {
    const batchBytes = Buffer.byteLength(JSON.stringify(req.body || {}));
    if (batchBytes > MAX_BATCH_BYTES) {
      return res.status(413).json({
        success: false,
        message: `Agent submission batch exceeds ${MAX_BATCH_BYTES} bytes`
      });
    }

    const parsed = publicSubmissionSchema.safeParse(req.body);
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      return res.status(422).json({
        success: false,
        message: flat.formErrors[0] || "Validation failed",
        errors: flat.fieldErrors
      });
    }

    const result = await queuePublicSubmissions({ parsed: parsed.data, req });
    const status = result.dryRun ? 200 : result.queued.length > 0 ? 202 : 422;
    return res.status(status).json({
      success: result.queued.length > 0 && result.rejected.length === 0,
      ...result
    });
  } catch (error) {
    return next(error);
  }
};

const getSubmissionStatus = async (req, res, next) => {
  try {
    const submission = await AgentSubmission.findOne({ submissionId: req.params.submissionId }).lean();
    if (!submission) {
      return res.status(404).json({ success: false, message: "Submission not found" });
    }
    return res.json({ success: true, data: publicSubmissionStatus(submission) });
  } catch (error) {
    return next(error);
  }
};

const getOpenApi = (req, res) => res.json(openApiDocument);

const getSubmissionSchema = (req, res) => res.json(submissionJsonSchema);

const exportPendingTournamentSubmissions = async (req, res, next) => {
  try {
    const limit = Math.min(1000, Math.max(1, Number(req.query.limit || 500)));
    const submissions = await AgentSubmission.find({ kind: "event", status: "queued" })
      .sort({ createdAt: 1 })
      .limit(limit)
      .select("submissionId normalized contentHash confidence qualityFlags evidenceRefs agent createdAt updatedAt")
      .lean();
    return res.json({
      success: true,
      data: submissions.map((submission) => ({
        submissionId: submission.submissionId,
        normalized: submission.normalized,
        contentHash: submission.contentHash,
        confidence: submission.confidence,
        qualityFlags: submission.qualityFlags,
        evidenceRefs: submission.evidenceRefs,
        agent: {
          name: submission.agent?.name || "",
          version: submission.agent?.version || "",
          url: submission.agent?.url || "",
          repositoryUrl: submission.agent?.repositoryUrl || ""
        },
        createdAt: submission.createdAt,
        updatedAt: submission.updatedAt
      }))
    });
  } catch (error) {
    return next(error);
  }
};

const updateTournamentSubmissionStatuses = async (req, res, next) => {
  try {
    const outcomes = Array.isArray(req.body?.outcomes) ? req.body.outcomes.slice(0, 1000) : [];
    const allowed = new Set(["published", "quarantined", "rejected", "failed"]);
    if (!outcomes.length || outcomes.some((outcome) => !outcome.submissionId || !allowed.has(outcome.status))) {
      return res.status(422).json({ success: false, message: "outcomes[] requires submissionId and a final status" });
    }
    let updated = 0;
    for (const outcome of outcomes) {
      const result = await AgentSubmission.updateOne(
        { submissionId: outcome.submissionId, kind: "event", status: "queued" },
        {
          $set: {
            status: outcome.status,
            decision: {
              reviewedAt: new Date(),
              reviewRunId: String(outcome.reviewRunId || "shared-tournament-pipeline"),
              reasons: (Array.isArray(outcome.reasons) ? outcome.reasons : []).map(String).slice(0, 20),
              publishedAt: outcome.status === "published" ? new Date() : null,
              publishResult: outcome.publishResult || {},
              error: String(outcome.error || "").slice(0, 2000)
            }
          }
        }
      );
      updated += result.modifiedCount;
    }
    return res.json({ success: true, updated });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createSubmission,
  exportPendingTournamentSubmissions,
  getOpenApi,
  getSubmissionSchema,
  getSubmissionStatus,
  updateTournamentSubmissionStatuses
};
