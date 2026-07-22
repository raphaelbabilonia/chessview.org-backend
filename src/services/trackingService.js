const crypto = require("crypto");
const TrackingDailyAggregate = require("../models/TrackingDailyAggregate");
const TrackingEvent = require("../models/TrackingEvent");
const { parseOrigins } = require("../config/env");

const PAGEVIEW_EVENTS = new Set(["page_view", "event_detail_view", "country_page_view", "source_page_view"]);
const MAX_DASHBOARD_DAYS = 90;

const isTrackingEnabled = () => process.env.TRACKING_ENABLED !== "false";

const dashboardCode = () => process.env.TRACKING_DASHBOARD_CODE || "";

const trackingSalt = () =>
  process.env.TRACKING_SALT || process.env.JWT_SECRET || "chessview-local-tracking-salt";

const splitOrigins = (value) =>
  String(value || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

const trackingAllowedOrigins = () => {
  const configured = splitOrigins(process.env.TRACKING_ALLOWED_ORIGINS);
  return configured.length ? configured : parseOrigins();
};

const originAllowed = (origin) => {
  if (!origin) return true;
  const allowed = trackingAllowedOrigins();
  if (!allowed.length && process.env.NODE_ENV !== "production") return true;
  return allowed.includes(origin);
};

const cleanString = (value, max = 220) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, max);

const cleanPath = (value) => {
  const raw = cleanString(value, 500);
  if (!raw) return "/";
  try {
    const url = raw.startsWith("http") ? new URL(raw) : new URL(raw, "https://chessview.org");
    return url.pathname || "/";
  } catch {
    return raw.split("?")[0].split("#")[0] || "/";
  }
};

const hostnameFromUrl = (value) => {
  const raw = cleanString(value, 600);
  if (!raw) return "";
  try {
    return new URL(raw, "https://chessview.org").hostname.replace(/^www\./, "").slice(0, 180);
  } catch {
    return "";
  }
};

const hmac = (value) => {
  const raw = cleanString(value, 200);
  if (!raw) return "";
  return crypto.createHmac("sha256", trackingSalt()).update(raw).digest("hex");
};

const compactRecord = (record = {}) =>
  Object.fromEntries(
    Object.entries(record || {})
      .slice(0, 20)
      .map(([key, value]) => [cleanString(key, 60), cleanString(value, 220)])
      .filter(([key, value]) => key && value)
  );

const parseUserAgent = (ua = "") => {
  const value = ua.toLowerCase();
  const bot = /bot|crawler|spider|preview|facebookexternalhit|slurp|bingpreview/.test(value);
  const mobile = /mobile|iphone|ipod|android.*mobile/.test(value);
  const tablet = /ipad|tablet|android(?!.*mobile)/.test(value);
  const browser =
    (value.includes("edg/") && "Edge") ||
    (value.includes("chrome/") && "Chrome") ||
    (value.includes("firefox/") && "Firefox") ||
    (value.includes("safari/") && "Safari") ||
    (value.includes("msie") && "Internet Explorer") ||
    "Other";
  const os =
    (value.includes("windows") && "Windows") ||
    (value.includes("mac os") && "macOS") ||
    (value.includes("iphone") || value.includes("ipad") ? "iOS" : "") ||
    (value.includes("android") && "Android") ||
    (value.includes("linux") && "Linux") ||
    "Other";

  return {
    deviceType: bot ? "bot" : tablet ? "tablet" : mobile ? "mobile" : "desktop",
    browser,
    os
  };
};

const publicIpCountry = (req) => cleanString(req.get("CF-IPCountry") || req.get("X-Vercel-IP-Country") || "", 2).toUpperCase();

const mapEvent = (input, req) => {
  const ua = req.get("User-Agent") || "";
  const parsed = parseUserAgent(ua);
  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
  const outboundUrl = cleanString(input.outboundUrl, 600);
  const fallbackVisitor = `${req.ip || ""}:${ua}`;

  return {
    eventName: input.eventName,
    occurredAt: Number.isNaN(occurredAt.getTime()) ? new Date() : occurredAt,
    visitorHash: hmac(input.visitorId || fallbackVisitor),
    sessionHash: hmac(input.sessionId || `${fallbackVisitor}:${new Date().toISOString().slice(0, 10)}`),
    path: cleanPath(input.path),
    routeType: cleanString(input.routeType || "unknown", 40),
    locale: cleanString(input.locale, 8),
    pageTitle: cleanString(input.pageTitle, 220),
    entityType: cleanString(input.entityType, 40),
    entityId: cleanString(input.entityId, 120),
    entitySlug: cleanString(input.entitySlug, 160),
    entityTitle: cleanString(input.entityTitle, 220),
    outboundUrl,
    outboundHost: hostnameFromUrl(outboundUrl),
    referrerDomain: cleanString(input.referrerDomain || hostnameFromUrl(input.referrer), 180),
    utmSource: cleanString(input.utmSource, 120),
    utmMedium: cleanString(input.utmMedium, 120),
    utmCampaign: cleanString(input.utmCampaign, 180),
    country: publicIpCountry(req),
    deviceType: cleanString(input.deviceType || parsed.deviceType, 20),
    browser: cleanString(input.browser || parsed.browser, 80),
    os: cleanString(input.os || parsed.os, 80),
    filters: compactRecord(input.filters),
    metadata: compactRecord(input.metadata),
    source: {
      origin: cleanString(req.get("Origin"), 220),
      userAgent: cleanString(ua, 320)
    }
  };
};

const ingestTrackingEvents = async ({ events, req }) => {
  if (!isTrackingEnabled()) return { accepted: 0, disabled: true };
  const docs = events.map((event) => mapEvent(event, req));
  await TrackingEvent.insertMany(docs, { ordered: false });
  return { accepted: docs.length, disabled: false };
};

const dateKey = (date) => new Date(date).toISOString().slice(0, 10);

const encodeCountKey = (key) => `k:${Buffer.from(cleanString(key || "unknown", 220) || "unknown", "utf8").toString("base64url")}`;

const decodeCountKey = (key) => {
  const value = String(key || "");
  if (!value.startsWith("k:")) return value;
  try {
    return Buffer.from(value.slice(2), "base64url").toString("utf8");
  } catch {
    return value;
  }
};

const increment = (map, key, amount = 1) => {
  const cleanKey = encodeCountKey(key);
  map[cleanKey] = (map[cleanKey] || 0) + amount;
};

const mapToObject = (value) => {
  if (!value) return {};
  if (value instanceof Map) return Object.fromEntries(value);
  return value;
};

const topEntries = (value, limit = 10) =>
  Object.entries(mapToObject(value))
    .map(([name, count]) => ({ name: decodeCountKey(name), count: Number(count || 0) }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map(({ name, count }) => ({ name, count }));

const buildAggregate = (date, events) => {
  const uniqueVisitors = new Set();
  const sessions = new Set();
  const aggregate = {
    date,
    pageviews: 0,
    events: events.length,
    uniqueVisitors: 0,
    sessions: 0,
    eventCounts: {},
    pathCounts: {},
    routeTypeCounts: {},
    localeCounts: {},
    referrerCounts: {},
    countryCounts: {},
    deviceCounts: {},
    browserCounts: {},
    outboundHostCounts: {},
    filterCounts: {},
    entityCounts: {},
    rolledUpAt: new Date()
  };

  for (const event of events) {
    if (event.visitorHash) uniqueVisitors.add(event.visitorHash);
    if (event.sessionHash) sessions.add(event.sessionHash);
    if (PAGEVIEW_EVENTS.has(event.eventName)) aggregate.pageviews += 1;
    increment(aggregate.eventCounts, event.eventName);
    increment(aggregate.pathCounts, event.path);
    increment(aggregate.routeTypeCounts, event.routeType);
    increment(aggregate.localeCounts, event.locale || "unknown");
    if (event.referrerDomain) increment(aggregate.referrerCounts, event.referrerDomain);
    if (event.country) increment(aggregate.countryCounts, event.country);
    if (event.deviceType) increment(aggregate.deviceCounts, event.deviceType);
    if (event.browser) increment(aggregate.browserCounts, event.browser);
    if (event.outboundHost) increment(aggregate.outboundHostCounts, event.outboundHost);
    if (event.entityTitle || event.entitySlug || event.entityId) {
      increment(aggregate.entityCounts, event.entityTitle || event.entitySlug || event.entityId);
    }
    for (const [key, value] of Object.entries(event.filters || {})) {
      increment(aggregate.filterCounts, `${key}:${value}`);
    }
  }

  aggregate.uniqueVisitors = uniqueVisitors.size;
  aggregate.sessions = sessions.size;
  return aggregate;
};

const rollupTrackingAnalytics = async ({ days = MAX_DASHBOARD_DAYS } = {}) => {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - Number(days || MAX_DASHBOARD_DAYS));
  since.setUTCHours(0, 0, 0, 0);

  const events = await TrackingEvent.find({ occurredAt: { $gte: since } }).lean();
  const grouped = events.reduce((groups, event) => {
    const key = dateKey(event.occurredAt);
    groups[key] ||= [];
    groups[key].push(event);
    return groups;
  }, {});

  const dates = Object.keys(grouped).sort();
  for (const date of dates) {
    const aggregate = buildAggregate(date, grouped[date]);
    await TrackingDailyAggregate.findOneAndUpdate({ date }, aggregate, { upsert: true, new: true });
  }

  return { dates: dates.length, events: events.length };
};

const emptyDashboard = () => ({
  totals: { pageviews: 0, events: 0, uniqueVisitors: 0, sessions: 0 },
  daily: [],
  topPages: [],
  topEvents: [],
  topRoutes: [],
  locales: [],
  referrers: [],
  countries: [],
  devices: [],
  browsers: [],
  outboundHosts: [],
  filters: [],
  entities: [],
  recent: []
});

const mergeCounts = (target, counts) => {
  for (const [key, value] of Object.entries(mapToObject(counts))) {
    target[key] = (target[key] || 0) + Number(value || 0);
  }
};

const getTrackingDashboard = async ({ days = 30 } = {}) => {
  const safeDays = Math.min(Math.max(Number(days) || 30, 1), MAX_DASHBOARD_DAYS);
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - safeDays + 1);
  since.setUTCHours(0, 0, 0, 0);
  const sinceKey = dateKey(since);

  const [aggregates, recent] = await Promise.all([
    TrackingDailyAggregate.find({ date: { $gte: sinceKey } }).sort({ date: 1 }).lean(),
    TrackingEvent.find({ occurredAt: { $gte: since } })
      .sort({ occurredAt: -1 })
      .limit(50)
      .select("-visitorHash -sessionHash -source.userAgent")
      .lean()
  ]);

  if (!aggregates.length && !recent.length) return emptyDashboard();

  const totals = { pageviews: 0, events: 0, uniqueVisitors: 0, sessions: 0 };
  const merged = {
    eventCounts: {},
    pathCounts: {},
    routeTypeCounts: {},
    localeCounts: {},
    referrerCounts: {},
    countryCounts: {},
    deviceCounts: {},
    browserCounts: {},
    outboundHostCounts: {},
    filterCounts: {},
    entityCounts: {}
  };

  for (const aggregate of aggregates) {
    totals.pageviews += Number(aggregate.pageviews || 0);
    totals.events += Number(aggregate.events || 0);
    totals.uniqueVisitors += Number(aggregate.uniqueVisitors || 0);
    totals.sessions += Number(aggregate.sessions || 0);
    Object.keys(merged).forEach((key) => mergeCounts(merged[key], aggregate[key]));
  }

  return {
    totals,
    daily: aggregates.map((aggregate) => ({
      date: aggregate.date,
      pageviews: aggregate.pageviews || 0,
      events: aggregate.events || 0,
      uniqueVisitors: aggregate.uniqueVisitors || 0,
      sessions: aggregate.sessions || 0
    })),
    topPages: topEntries(merged.pathCounts, 20),
    topEvents: topEntries(merged.eventCounts, 20),
    topRoutes: topEntries(merged.routeTypeCounts, 12),
    locales: topEntries(merged.localeCounts, 8),
    referrers: topEntries(merged.referrerCounts, 20),
    countries: topEntries(merged.countryCounts, 20),
    devices: topEntries(merged.deviceCounts, 8),
    browsers: topEntries(merged.browserCounts, 10),
    outboundHosts: topEntries(merged.outboundHostCounts, 20),
    filters: topEntries(merged.filterCounts, 30),
    entities: topEntries(merged.entityCounts, 20),
    recent: recent.map((event) => ({
      eventName: event.eventName,
      occurredAt: event.occurredAt,
      path: event.path,
      routeType: event.routeType,
      locale: event.locale,
      entityTitle: event.entityTitle,
      outboundHost: event.outboundHost,
      referrerDomain: event.referrerDomain,
      deviceType: event.deviceType,
      browser: event.browser,
      country: event.country,
      filters: event.filters || {}
    }))
  };
};

module.exports = {
  dashboardCode,
  getTrackingDashboard,
  ingestTrackingEvents,
  isTrackingEnabled,
  originAllowed,
  rollupTrackingAnalytics
};
