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

module.exports = {
  createSubmission,
  getOpenApi,
  getSubmissionSchema,
  getSubmissionStatus
};
