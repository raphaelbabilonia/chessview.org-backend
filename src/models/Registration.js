const mongoose = require("mongoose");

const registrationSchema = new mongoose.Schema(
  {
    event: { type: mongoose.Schema.Types.ObjectId, ref: "Event", required: true },
    section: { type: mongoose.Schema.Types.ObjectId, ref: "Section", required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    club: { type: String, default: "" },
    rating: { type: Number, default: 0 },
    birthYear: { type: Number, default: null },
    status: {
      type: String,
      enum: ["pending", "approved", "cancelled", "rejected"],
      default: "pending"
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Registration", registrationSchema);
