const mongoose = require("mongoose");

const sectionSchema = new mongoose.Schema(
  {
    event: { type: mongoose.Schema.Types.ObjectId, ref: "Event", required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    maxPlayers: { type: Number, default: 0 },
    ratingMin: { type: Number, default: null },
    ratingMax: { type: Number, default: null },
    birthYearMin: { type: Number, default: null },
    birthYearMax: { type: Number, default: null },
    timeControl: { type: String, default: "" },
    roundsCount: { type: Number, default: 5 },
    pairingSystem: { type: String, default: "" },
    scoringSystem: { type: String, default: "" },
    ratingRule: { type: String, default: "" },
    resultsSource: { type: String, default: "" },
    sourceTieBreaks: { type: [String], default: [] },
    tieBreakRating: { type: Number, default: 0 },
    source: {
      name: { type: String, default: "" },
      originalId: { type: String, default: "" },
      imported: { type: Boolean, default: false },
      lastCheckedAt: { type: Date, default: null }
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Section", sectionSchema);
