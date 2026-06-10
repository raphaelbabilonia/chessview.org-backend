const mongoose = require("mongoose");

const deviceSchema = new mongoose.Schema(
  {
    deviceId: { type: String, required: true, unique: true, trim: true },
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
    lastRssi: { type: Number, default: null },
    notes: { type: String, default: "" }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Device", deviceSchema);
