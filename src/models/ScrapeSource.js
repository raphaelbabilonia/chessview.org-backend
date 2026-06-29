const mongoose = require("mongoose");

const scrapeSourceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    key: { type: String, required: true, unique: true, trim: true },
    type: {
      type: String,
      enum: [
        "aicf-calendar",
        "chessarbiter",
        "chessreg-api",
        "fide-calendar",
        "fide-rated-tournaments",
        "info64",
        "lichess-broadcasts",
        "manual-review",
        "vesus"
      ],
      required: true
    },
    enabled: { type: Boolean, default: true },
    config: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    intervalMinutes: { type: Number, default: 360 },
    lastRunAt: { type: Date, default: null },
    lastSuccessAt: { type: Date, default: null },
    lastErrorAt: { type: Date, default: null },
    lastError: { type: String, default: "" },
    nextRunAt: { type: Date, default: null },
    lockedAt: { type: Date, default: null },
    lockedUntil: { type: Date, default: null },
    lockedBy: { type: String, default: "" }
  },
  { timestamps: true }
);

scrapeSourceSchema.index({ enabled: 1, nextRunAt: 1 });
scrapeSourceSchema.index({ enabled: 1, nextRunAt: 1, lockedUntil: 1 });
scrapeSourceSchema.index({ type: 1 });

module.exports = mongoose.model("ScrapeSource", scrapeSourceSchema);
