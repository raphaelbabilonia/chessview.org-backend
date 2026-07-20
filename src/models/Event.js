const mongoose = require("mongoose");

const eventSourceRefSchema = new mongoose.Schema(
  {
    sourceKey: { type: String, required: true, trim: true },
    name: { type: String, default: "" },
    url: { type: String, default: "" },
    originalId: { type: String, default: "" },
    lastCheckedAt: { type: Date, default: null },
    contentHash: { type: String, default: "" }
  },
  { _id: false }
);

const eventLocationSchema = new mongoose.Schema(
  {
    city: { type: String, default: "" },
    region: { type: String, default: "" },
    country: { type: String, default: "" },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    coordinates: { type: [Number], default: undefined },
    coordinateStatus: {
      type: String,
      enum: ["", "resolved", "missing", "manual-review"],
      default: ""
    },
    coordinateSource: { type: String, default: "" },
    coordinateLabel: { type: String, default: "" },
    geocodedAt: { type: Date, default: null }
  },
  { _id: false }
);

const eventSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, index: true },
    dedupeKey: { type: String, default: "", index: true },
    canonicalFamilyKey: { type: String, default: undefined },
    sourceKeys: { type: [String], default: undefined },
    sourceRefs: { type: [eventSourceRefSchema], default: undefined },
    description: { type: String, default: "" },
    organizer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    city: { type: String, required: true, trim: true },
    venueName: { type: String, default: "" },
    address: { type: String, default: "" },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: {
      type: String,
      enum: ["draft", "published", "completed", "cancelled"],
      default: "draft"
    },
    registrationStatus: {
      type: String,
      enum: ["closed", "open", "full"],
      default: "closed"
    },
    timeControl: { type: String, default: "" },
    country: { type: String, default: "" },
    region: { type: String, default: "" },
    location: { type: eventLocationSchema, default: () => ({}) },
    ratingType: {
      type: String,
      enum: ["", "FIDE", "national", "unrated"],
      default: ""
    },
    maxPlayers: { type: Number, default: 0 },
    contactEmail: { type: String, default: "" },
    contactPhone: { type: String, default: "" },
    sourceOrganizerName: { type: String, default: "" },
    websiteUrl: { type: String, default: "" },
    resultsUrl: { type: String, default: "" },
    regulationsUrl: { type: String, default: "" },
    source: {
      name: { type: String, default: "" },
      url: { type: String, default: "" },
      originalId: { type: String, default: "" },
      lastCheckedAt: { type: Date, default: null },
      detailLastCheckedAt: { type: Date, default: null },
      detailStatus: {
        type: String,
        enum: ["", "complete", "partial", "documents-only", "empty", "failed"],
        default: ""
      },
      detailError: { type: String, default: "" },
      detailStats: {
        sections: { type: Number, default: 0 },
        players: { type: Number, default: 0 },
        rounds: { type: Number, default: 0 },
        pairings: { type: Number, default: 0 },
        documents: { type: Number, default: 0 }
      }
    },
    externalLinks: {
      type: [
        {
          label: { type: String, default: "" },
          type: { type: String, default: "" },
          url: { type: String, default: "" },
          sourceName: { type: String, default: "" }
        }
      ],
      default: []
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    dataQualityScore: { type: Number, default: 0 },
    isPublic: { type: Boolean, default: false }
  },
  { timestamps: true }
);

eventSchema.index({ slug: 1, organizer: 1 });
eventSchema.index({ "source.name": 1, "source.originalId": 1 });

module.exports = mongoose.model("Event", eventSchema);
