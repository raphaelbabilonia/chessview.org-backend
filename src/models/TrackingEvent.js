const mongoose = require("mongoose");

const trackingEventSchema = new mongoose.Schema(
  {
    eventName: { type: String, required: true, index: true },
    occurredAt: { type: Date, required: true, index: true },
    receivedAt: { type: Date, default: Date.now },
    visitorHash: { type: String, default: "", index: true },
    sessionHash: { type: String, default: "", index: true },
    path: { type: String, required: true, index: true },
    routeType: { type: String, default: "unknown", index: true },
    locale: { type: String, default: "", index: true },
    pageTitle: { type: String, default: "" },
    entityType: { type: String, default: "", index: true },
    entityId: { type: String, default: "", index: true },
    entitySlug: { type: String, default: "", index: true },
    entityTitle: { type: String, default: "" },
    outboundUrl: { type: String, default: "" },
    outboundHost: { type: String, default: "", index: true },
    referrerDomain: { type: String, default: "", index: true },
    utmSource: { type: String, default: "", index: true },
    utmMedium: { type: String, default: "", index: true },
    utmCampaign: { type: String, default: "", index: true },
    country: { type: String, default: "", index: true },
    deviceType: { type: String, default: "", index: true },
    browser: { type: String, default: "", index: true },
    os: { type: String, default: "", index: true },
    filters: { type: mongoose.Schema.Types.Mixed, default: {} },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    source: {
      origin: { type: String, default: "" }
    }
  },
  { timestamps: true }
);

trackingEventSchema.index({ occurredAt: 1, eventName: 1 });
trackingEventSchema.index({ path: 1, occurredAt: -1 });
trackingEventSchema.index({ receivedAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

module.exports = mongoose.model("TrackingEvent", trackingEventSchema);
