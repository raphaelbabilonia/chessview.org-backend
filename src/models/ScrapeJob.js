const mongoose = require("mongoose");

const scrapeJobSchema = new mongoose.Schema(
  {
    source: { type: mongoose.Schema.Types.ObjectId, ref: "ScrapeSource", default: null },
    sourceName: { type: String, required: true, trim: true },
    sourceType: { type: String, required: true, trim: true },
    mode: {
      type: String,
      enum: ["dry-run", "apply"],
      default: "dry-run"
    },
    status: {
      type: String,
      enum: ["queued", "running", "succeeded", "failed"],
      default: "queued"
    },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    configSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    stats: {
      fetched: { type: Number, default: 0 },
      created: { type: Number, default: 0 },
      updated: { type: Number, default: 0 },
      skipped: { type: Number, default: 0 }
    },
    warnings: { type: [String], default: [] },
    sourceUrl: { type: String, default: "" },
    results: {
      type: [
        {
          action: { type: String, default: "" },
          id: { type: String, default: "" },
          slug: { type: String, default: "" },
          title: { type: String, default: "" },
          sourceUrl: { type: String, default: "" }
        }
      ],
      default: []
    },
    error: {
      message: { type: String, default: "" }
    }
  },
  { timestamps: true }
);

scrapeJobSchema.index({ source: 1, createdAt: -1 });
scrapeJobSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("ScrapeJob", scrapeJobSchema);
