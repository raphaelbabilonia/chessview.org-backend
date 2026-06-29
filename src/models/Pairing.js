const mongoose = require("mongoose");

const pairingSchema = new mongoose.Schema(
  {
    event: { type: mongoose.Schema.Types.ObjectId, ref: "Event", required: true },
    section: { type: mongoose.Schema.Types.ObjectId, ref: "Section", required: true },
    round: { type: mongoose.Schema.Types.ObjectId, ref: "Round", required: true },
    boardNumber: { type: Number, required: true },
    whitePlayer: { type: mongoose.Schema.Types.ObjectId, ref: "Player", required: true },
    blackPlayer: { type: mongoose.Schema.Types.ObjectId, ref: "Player", default: null },
    result: {
      type: String,
      enum: [
        "pending",
        "1-0",
        "0-1",
        "1/2-1/2",
        "bye-white",
        "bye-black",
        "half-bye",
        "zero-bye",
        "forfeit-white",
        "forfeit-black"
      ],
      default: "pending"
    },
    sourceWhitePoints: { type: Number, default: null },
    sourceBlackPoints: { type: Number, default: null },
    notes: { type: String, default: "" },
    source: {
      name: { type: String, default: "" },
      originalId: { type: String, default: "" },
      imported: { type: Boolean, default: false },
      lastCheckedAt: { type: Date, default: null }
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Pairing", pairingSchema);
