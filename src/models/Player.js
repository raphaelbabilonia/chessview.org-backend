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
    birthYear: { type: Number, default: null },
    email: { type: String, default: "", trim: true, lowercase: true },
    status: {
      type: String,
      enum: ["active", "withdrawn"],
      default: "active"
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Player", playerSchema);
