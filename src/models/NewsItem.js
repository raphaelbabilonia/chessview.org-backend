const mongoose = require("mongoose");

const relatedCoverageSchema = new mongoose.Schema(
  {
    sourceName: { type: String, default: "" },
    url: { type: String, default: "" },
    relationship: { type: String, default: "" }
  },
  { _id: false }
);

const evidenceRefSchema = new mongoose.Schema(
  {
    refId: { type: String, default: "" },
    path: { type: String, default: "" },
    sourceUrl: { type: String, default: "" },
    canonicalUrl: { type: String, default: "" },
    capturedAt: { type: Date, default: null },
    excerpt: { type: String, default: "" },
    notes: { type: String, default: "" }
  },
  { _id: false }
);

const newsItemSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, index: true },
    summary: { type: String, required: true, trim: true },
    summaryType: { type: String, enum: ["generated", "editorial", ""], default: "generated" },
    sourceName: { type: String, required: true, trim: true },
    sourceHomeUrl: { type: String, default: "" },
    sourceUrl: { type: String, required: true, trim: true, index: true },
    canonicalUrl: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true },
    author: { type: String, default: "" },
    publishedAt: { type: Date, default: null, index: true },
    updatedAt: { type: Date, default: null },
    language: { type: String, default: "en" },
    region: { type: String, default: "" },
    category: { type: String, default: "other" },
    imageUrl: { type: String, default: "" },
    tags: { type: [String], default: [] },
    relatedTournamentId: { type: String, default: "" },
    relatedTournamentName: { type: String, default: "" },
    relatedPlayerIds: { type: [String], default: [] },
    relatedPlayerNames: { type: [String], default: [] },
    relatedCoverage: { type: [relatedCoverageSchema], default: [] },
    originalId: { type: String, default: "", index: true },
    contentHash: { type: String, default: "", index: true },
    dedupeKey: { type: String, default: "", index: true },
    confidence: { type: Number, default: 0 },
    qualityFlags: { type: [String], default: [] },
    evidenceRefs: { type: [evidenceRefSchema], default: [] },
    sourceLastCheckedAt: { type: Date, default: null },
    approvedAt: { type: Date, default: null },
    approvedBy: { type: String, default: "" },
    publishStatus: {
      type: String,
      enum: ["ready", "quarantined", "published"],
      default: "ready",
      index: true
    },
    isPublic: { type: Boolean, default: true, index: true }
  },
  { timestamps: true }
);

newsItemSchema.index({ canonicalUrl: 1 }, { unique: true });
newsItemSchema.index({ sourceName: 1, originalId: 1 });

module.exports = mongoose.model("NewsItem", newsItemSchema);
