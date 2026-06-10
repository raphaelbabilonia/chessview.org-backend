const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, index: true },
    description: { type: String, default: "" },
    organizer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    city: { type: String, required: true, trim: true },
    venueName: { type: String, default: "" },
    address: { type: String, default: "" },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: {
      type: String,
      enum: ["draft", "published", "completed", "cancelled"],
      default: "draft"
    },
    registrationStatus: {
      type: String,
      enum: ["closed", "open", "full"],
      default: "closed"
    },
    timeControl: { type: String, default: "" },
    maxPlayers: { type: Number, default: 0 },
    contactEmail: { type: String, default: "" },
    websiteUrl: { type: String, default: "" },
    regulationsUrl: { type: String, default: "" },
    isPublic: { type: Boolean, default: false }
  },
  { timestamps: true }
);

eventSchema.index({ slug: 1, organizer: 1 });

module.exports = mongoose.model("Event", eventSchema);
