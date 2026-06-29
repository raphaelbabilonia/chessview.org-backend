const mongoose = require("mongoose");

const playerSchema = new mongoose.Schema(
  {
    event: { type: mongoose.Schema.Types.ObjectId, ref: "Event", required: true },
    section: { type: mongoose.Schema.Types.ObjectId, ref: "Section", required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    federation: { type: String, default: "ITA" },
    club: { type: String, default: "" },
    rating: { type: Number, default: 0 },
    fideId: { type: String, default: "" },
    title: { type: String, default: "" },
    gender: { type: String, default: "" },
    nationalId: { type: String, default: "" },
    nationalRating: { type: Number, default: 0 },
    fideK: { type: Number, default: 0 },
    nationalK: { type: Number, default: 0 },
    performanceRating: { type: Number, default: 0 },
    ratingChange: { type: Number, default: null },
    sourceRank: { type: Number, default: 0 },
    sourcePoints: { type: Number, default: 0 },
    sourceRankedId: { type: Number, default: 0 },
    sourceTieBreaks: { type: [String], default: [] },
    sourceMatches: { type: [String], default: [] },
    birthYear: { type: Number, default: null },
    email: { type: String, default: "", trim: true, lowercase: true },
    status: {
      type: String,
      enum: ["active", "withdrawn"],
      default: "active"
    },
    source: {
      name: { type: String, default: "" },
      originalId: { type: String, default: "" },
      imported: { type: Boolean, default: false },
      lastCheckedAt: { type: Date, default: null }
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Player", playerSchema);
