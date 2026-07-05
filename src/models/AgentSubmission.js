const mongoose = require("mongoose");

const agentSubmissionSchema = new mongoose.Schema(
  {
    submissionId: { type: String, required: true, unique: true, index: true },
    kind: { type: String, enum: ["event", "news"], required: true, index: true },
    status: {
      type: String,
      enum: ["queued", "published", "quarantined", "rejected", "failed"],
      default: "queued",
      index: true
    },
    runId: { type: String, default: "", index: true },
    agent: {
      name: { type: String, default: "" },
      version: { type: String, default: "" },
      url: { type: String, default: "" },
      contact: { type: String, default: "" },
      repositoryUrl: { type: String, default: "" }
    },
    item: { type: mongoose.Schema.Types.Mixed, default: {} },
    normalized: { type: mongoose.Schema.Types.Mixed, default: {} },
    dedupeKey: { type: String, default: "", index: true },
    contentHash: { type: String, required: true, index: true },
    confidence: { type: Number, default: 0 },
    qualityFlags: { type: [String], default: [] },
    evidenceRefs: { type: [mongoose.Schema.Types.Mixed], default: [] },
    request: {
      ipHash: { type: String, default: "" },
      userAgentHash: { type: String, default: "" },
      origin: { type: String, default: "" }
    },
    decision: {
      reviewedAt: { type: Date, default: null },
      reviewRunId: { type: String, default: "" },
      reasons: { type: [String], default: [] },
      publishedAt: { type: Date, default: null },
      publishResult: { type: mongoose.Schema.Types.Mixed, default: {} },
      error: { type: String, default: "" }
    }
  },
  { timestamps: true }
);

agentSubmissionSchema.index({ kind: 1, contentHash: 1 }, { unique: true });
agentSubmissionSchema.index({ status: 1, createdAt: 1 });
agentSubmissionSchema.index({ dedupeKey: 1, kind: 1 });

module.exports = mongoose.model("AgentSubmission", agentSubmissionSchema);
