const mongoose = require("mongoose");

const trackingDailyAggregateSchema = new mongoose.Schema(
  {
    date: { type: String, required: true, unique: true, index: true },
    pageviews: { type: Number, default: 0 },
    events: { type: Number, default: 0 },
    uniqueVisitors: { type: Number, default: 0 },
    sessions: { type: Number, default: 0 },
    eventCounts: { type: Map, of: Number, default: {} },
    pathCounts: { type: Map, of: Number, default: {} },
    routeTypeCounts: { type: Map, of: Number, default: {} },
    localeCounts: { type: Map, of: Number, default: {} },
    referrerCounts: { type: Map, of: Number, default: {} },
    countryCounts: { type: Map, of: Number, default: {} },
    deviceCounts: { type: Map, of: Number, default: {} },
    browserCounts: { type: Map, of: Number, default: {} },
    outboundHostCounts: { type: Map, of: Number, default: {} },
    filterCounts: { type: Map, of: Number, default: {} },
    entityCounts: { type: Map, of: Number, default: {} },
    rolledUpAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

module.exports = mongoose.model("TrackingDailyAggregate", trackingDailyAggregateSchema);
