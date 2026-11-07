const mongoose = require("mongoose");

const deviceSchema = new mongoose.Schema(
  {
    deviceId: { type: String, required: true, unique: true, trim: true },
    // The organizer who registered the device. Devices from before ownership
    // existed have none, so only an admin can manage them.
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    name: { type: String, required: true, trim: true },
    secretHash: { type: String, required: true },
    firmwareVersion: { type: String, default: "" },
    status: {
      type: String,
      enum: ["new", "active", "disabled"],
      default: "new"
    },
    lastSeenAt: { type: Date, default: null },
    lastBatteryMv: { type: Number, default: null },
    lastBatteryPercent: { type: Number, default: null },
    lastCharging: { type: Boolean, default: null },
    lastRssi: { type: Number, default: null },
    lastClockState: { type: String, default: "" },
    lastActiveBroadcastId: { type: String, default: "" },
    lastQueuedEvents: { type: Number, default: null },
    lastFreeStorageBytes: { type: Number, default: null },
    notes: { type: String, default: "" }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Device", deviceSchema);
