const mongoose = require("mongoose");

const frameSchema = new mongoose.Schema(
  {
    broadcast: { type: mongoose.Schema.Types.ObjectId, ref: "BroadcastSession", required: true },
    device: { type: mongoose.Schema.Types.ObjectId, ref: "Device", required: true },
    // Denormalised from the broadcast so move events can be queried per game
    // without a join; validated against the broadcast's pairing on ingest.
    pairing: { type: mongoose.Schema.Types.ObjectId, ref: "Pairing", default: null },
    deviceSeq: { type: Number, required: true },
    // Stable per-device JPEG id generated on the clock; used as a secondary
    // idempotency key. Left unset (not "") when the device omits it so the
    // partial-unique index below only constrains frames that actually carry one.
    imageClientId: { type: String },
    // Timestamps arrive as strings: ISO UTC when the clock has a real clock,
    // otherwise a device-relative token like "millis:123456".
    capturedAt: { type: String, required: true },
    imageCapturedAt: { type: String, default: "" },
    pressedAt: { type: String, default: "" },
    receivedAt: { type: Date, default: Date.now },
    imageUrl: { type: String, required: true },
    thumbnailUrl: { type: String, default: "" },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    jpegSha256: { type: String, default: "" },
    // Move metadata. The clock never sends notation (it cannot know it); it only
    // sends positional/temporal metadata that the backend later turns into a PGN.
    ply: { type: Number, default: null },
    moveNumber: { type: Number, default: null },
    sideJustMoved: { type: String, enum: ["white", "black", "unknown"], default: "unknown" },
    sideToMove: { type: String, enum: ["white", "black", "unknown"], default: "unknown" },
    whiteRemainingMs: { type: Number, default: null },
    blackRemainingMs: { type: Number, default: null },
    moveDurationMs: { type: Number, default: null },
    clockStateAfterPress: {
      type: String,
      enum: ["running", "paused", "flagged", "ended", "unknown"],
      default: "unknown"
    },
    batteryMv: { type: Number, default: null },
    rssi: { type: Number, default: null },
    firmwareVersion: { type: String, default: "" },
    // Incoherent metadata (e.g. ply parity disagreeing with sideJustMoved) is
    // stored, not rejected — the backend flags it here for later review.
    anomalies: { type: [String], default: [] },
    status: {
      type: String,
      enum: ["received", "needs-label", "labeled", "rejected"],
      default: "received"
    },
    rejectionReason: {
      type: String,
      enum: ["blurred", "hand-occluded", "wrong-board", "duplicate", "other", ""],
      default: ""
    }
  },
  { timestamps: true }
);

frameSchema.index({ device: 1, deviceSeq: 1 }, { unique: true });
// Secondary idempotency key: unique per device but only among frames that carry
// an imageClientId (partial filter), so frames without one are not constrained.
frameSchema.index(
  { device: 1, imageClientId: 1 },
  { unique: true, partialFilterExpression: { imageClientId: { $exists: true } } }
);

module.exports = mongoose.model("Frame", frameSchema);
