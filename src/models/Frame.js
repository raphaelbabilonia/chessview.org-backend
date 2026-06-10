const mongoose = require("mongoose");

const frameSchema = new mongoose.Schema(
  {
    broadcast: { type: mongoose.Schema.Types.ObjectId, ref: "BroadcastSession", required: true },
    device: { type: mongoose.Schema.Types.ObjectId, ref: "Device", required: true },
    deviceSeq: { type: Number, required: true },
    capturedAt: { type: String, required: true },
    receivedAt: { type: Date, default: Date.now },
    imageUrl: { type: String, required: true },
    thumbnailUrl: { type: String, default: "" },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    batteryMv: { type: Number, default: null },
    rssi: { type: Number, default: null },
    firmwareVersion: { type: String, default: "" },
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

module.exports = mongoose.model("Frame", frameSchema);
