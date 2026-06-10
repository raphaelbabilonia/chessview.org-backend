const mongoose = require("mongoose");

const broadcastSessionSchema = new mongoose.Schema(
  {
    event: { type: mongoose.Schema.Types.ObjectId, ref: "Event", required: true },
    section: { type: mongoose.Schema.Types.ObjectId, ref: "Section", required: true },
    round: { type: mongoose.Schema.Types.ObjectId, ref: "Round", required: true },
    pairing: { type: mongoose.Schema.Types.ObjectId, ref: "Pairing", required: true },
    boardNumber: { type: Number, required: true },
    device: { type: mongoose.Schema.Types.ObjectId, ref: "Device", required: true },
    status: {
      type: String,
      enum: ["setup", "live", "ended", "cancelled"],
      default: "live"
    },
    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date, default: null },
    orientation: {
      type: String,
      enum: ["whiteBottom", "blackBottom", "unknown"],
      default: "unknown"
    },
    calibration: { type: Object, default: null }
  },
  { timestamps: true }
);

module.exports = mongoose.model("BroadcastSession", broadcastSessionSchema);
