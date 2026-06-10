const mongoose = require("mongoose");

const roundSchema = new mongoose.Schema(
  {
    event: { type: mongoose.Schema.Types.ObjectId, ref: "Event", required: true },
    section: { type: mongoose.Schema.Types.ObjectId, ref: "Section", required: true },
    number: { type: Number, required: true },
    name: { type: String, default: "" },
    status: {
      type: String,
      enum: ["draft", "published", "completed"],
      default: "draft"
    },
    startsAt: { type: Date, default: null }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Round", roundSchema);
