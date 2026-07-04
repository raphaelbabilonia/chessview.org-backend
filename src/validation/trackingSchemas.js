const { z } = require("zod");

const eventNames = [
  "page_view",
  "event_detail_view",
  "events_filter_apply",
  "event_view_details",
  "event_original_click",
  "event_announcement_open",
  "news_original_click",
  "news_filter_apply",
  "language_change",
  "theme_change",
  "country_page_view",
  "source_page_view",
  "github_source_click"
];

const routeTypes = [
  "home",
  "events",
  "event_detail",
  "news",
  "country",
  "source",
  "tracking",
  "not_found",
  "unknown"
];

const stringish = z.union([z.string(), z.number(), z.boolean()]).transform((value) => String(value).slice(0, 220));

const safeRecord = z.record(z.string().max(60), stringish).default({});

const trackingEventSchema = z.object({
  eventName: z.enum(eventNames),
  occurredAt: z.string().datetime().optional(),
  visitorId: z.string().min(1).max(160).optional(),
  sessionId: z.string().min(1).max(160).optional(),
  path: z.string().min(1).max(500),
  routeType: z.enum(routeTypes).optional(),
  locale: z.enum(["en", "es", "it"]).optional(),
  pageTitle: z.string().max(220).optional(),
  entityType: z.string().max(40).optional(),
  entityId: z.string().max(120).optional(),
  entitySlug: z.string().max(160).optional(),
  entityTitle: z.string().max(220).optional(),
  outboundUrl: z.string().max(600).optional(),
  referrer: z.string().max(600).optional(),
  referrerDomain: z.string().max(180).optional(),
  utmSource: z.string().max(120).optional(),
  utmMedium: z.string().max(120).optional(),
  utmCampaign: z.string().max(180).optional(),
  deviceType: z.enum(["desktop", "mobile", "tablet", "bot", "unknown"]).optional(),
  browser: z.string().max(80).optional(),
  os: z.string().max(80).optional(),
  filters: safeRecord.optional(),
  metadata: safeRecord.optional()
});

const trackingBatchSchema = z.object({
  events: z.array(trackingEventSchema).min(1).max(25)
});

module.exports = {
  eventNames,
  routeTypes,
  trackingBatchSchema
};
