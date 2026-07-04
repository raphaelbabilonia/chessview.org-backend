const mongoose = require("mongoose");

const trackingAutomationRunSchema = new mongoose.Schema(
  {
    runId: { type: String, required: true, unique: true, index: true },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date, default: null },
    status: { type: String, enum: ["running", "completed", "failed"], default: "running", index: true },
    summary: { type: String, default: "" },
    changedFiles: { type: [String], default: [] },
    missingCoverage: { type: [String], default: [] },
    notes: { type: [String], default: [] },
    artifacts: { type: [String], default: [] }
  },
  { timestamps: true }
);

module.exports = mongoose.model("TrackingAutomationRun", trackingAutomationRunSchema);
