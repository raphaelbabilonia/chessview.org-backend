const mongoose = require("mongoose");

const eventDocumentSchema = new mongoose.Schema(
  {
    event: { type: mongoose.Schema.Types.ObjectId, ref: "Event", required: true, index: true },
    label: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ["source", "website", "results", "regulations", "pdf", "excel", "word", "pgn", "image", "archive", "other"],
      default: "other"
    },
    url: { type: String, required: true, trim: true },
    localUrl: { type: String, default: "" },
    localPath: { type: String, default: "" },
    mimeType: { type: String, default: "" },
    sizeBytes: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["linked", "downloaded", "failed"],
      default: "linked"
    },
    error: { type: String, default: "" },
    source: {
      name: { type: String, default: "" },
      originalId: { type: String, default: "" },
      imported: { type: Boolean, default: false },
      lastCheckedAt: { type: Date, default: null }
    }
  },
  { timestamps: true }
);

eventDocumentSchema.index({ event: 1, url: 1 }, { unique: true });
eventDocumentSchema.index({ event: 1, "source.name": 1, "source.imported": 1 });

module.exports = mongoose.model("EventDocument", eventDocumentSchema);
