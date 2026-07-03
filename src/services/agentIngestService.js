const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const Event = require("../models/Event");
const NewsItem = require("../models/NewsItem");
const User = require("../models/User");
const slugify = require("../utils/slugify");

const TOURNAMENT_CONFIDENCE_MIN = 0.75;
const NEWS_CONFIDENCE_MIN = 0.8;

const COMMON_BLOCKING_FLAGS = new Set([
  "legal_review_required",
  "low_confidence",
  "duplicate_possible",
  "source_requires_manual_check"
]);

const NEWS_BLOCKING_FLAGS = new Set([
  ...COMMON_BLOCKING_FLAGS,
  "paywall_detected",
  "primary_source_missing",
  "discovery_only_source",
  "summary_needs_review"
]);

const allowedEventRatingTypes = new Set(["FIDE", "national", "unrated"]);

const normalizeArray = (value) => (Array.isArray(value) ? value : []);

const asDate = (value, fallback = null) => {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
};

const originFromUrl = (value) => {
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
};

const firstString = (...values) => values.find((value) => typeof value === "string" && value.trim());

const uniqueLinks = (links) => {
  const seen = new Set();
  return links
    .filter((link) => link && link.url)
    .map((link) => ({
      label: link.label || "",
      type: link.type || "",
      url: link.url,
      sourceName: link.sourceName || ""
    }))
    .filter((link) => {
      if (seen.has(link.url)) return false;
      seen.add(link.url);
      return true;
    });
};

const ensureReady = (item, { minConfidence, blockingFlags }) => {
  const reasons = [];
  if (item.publishStatus !== "ready") reasons.push("publishStatus is not ready");
  if (typeof item.confidence !== "number" || item.confidence < minConfidence) {
    reasons.push(`confidence below ${minConfidence}`);
  }
  for (const flag of normalizeArray(item.qualityFlags)) {
    if (blockingFlags.has(flag)) reasons.push(`blocking quality flag: ${flag}`);
  }
  return reasons;
};

const findAgentOrganizer = async () => {
  const configuredEmail = process.env.AGENT_PUBLISH_USER_EMAIL;
  if (configuredEmail) {
    const user = await User.findOne({ email: configuredEmail.toLowerCase(), role: { $in: ["admin", "organizer"] } });
    if (user) return user;
  }
  const existing = (await User.findOne({ role: "admin" })) || (await User.findOne({ role: "organizer" }));
  if (existing) return existing;

  const email = (process.env.AGENT_SERVICE_USER_EMAIL || "agent-publisher@chessview.local").toLowerCase();
  const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10);
  return User.create({
    name: "ChessView Agent Publisher",
    email,
    passwordHash,
    role: "organizer"
  });
};

const makeUniqueEventSlug = async (title, existingId = null) => {
  const base = slugify(title);
  let slug = base;
  let suffix = 2;
  // eslint-disable-next-line no-await-in-loop
  while (await Event.findOne({ slug, ...(existingId ? { _id: { $ne: existingId } } : {}) })) {
    slug = `${base}-${suffix++}`;
  }
  return slug;
};

const makeUniqueNewsSlug = async (title, requestedSlug, existingId = null) => {
  const base = slugify(requestedSlug || title, { fallback: "news", maxLength: 120 });
  let slug = base;
  let suffix = 2;
  // eslint-disable-next-line no-await-in-loop
  while (await NewsItem.findOne({ slug, ...(existingId ? { _id: { $ne: existingId } } : {}) })) {
    slug = `${base}-${suffix++}`;
  }
  return slug;
};

const tournamentQuery = (item) => {
  const clauses = [];
  if (item.dedupeKey) clauses.push({ dedupeKey: item.dedupeKey });
  if (item.originalId) clauses.push({ "source.originalId": item.originalId });
  if (item.sourceUrl) clauses.push({ "source.url": item.sourceUrl });
  if (clauses.length === 0) return null;
  return { $or: clauses };
};

const newsQuery = (item) => {
  const clauses = [];
  if (item.dedupeKey) clauses.push({ dedupeKey: item.dedupeKey });
  if (item.canonicalUrl) clauses.push({ canonicalUrl: item.canonicalUrl });
  if (item.sourceUrl) clauses.push({ sourceUrl: item.sourceUrl });
  if (item.originalId) clauses.push({ originalId: item.originalId });
  if (item.contentHash) clauses.push({ contentHash: item.contentHash });
  if (clauses.length === 0) return null;
  return { $or: clauses };
};

const mapTournament = async (item, organizer, existing = null) => {
  const startDate = asDate(item.startDate);
  const endDate = asDate(item.endDate, startDate);
  const externalLinks = uniqueLinks([
    item.websiteUrl && { label: "Website", type: "website", url: item.websiteUrl, sourceName: item.sourceName },
    item.registrationUrl && { label: "Registration", type: "registration", url: item.registrationUrl, sourceName: item.sourceName },
    item.resultsUrl && { label: "Results", type: "results", url: item.resultsUrl, sourceName: item.sourceName },
    item.regulationsUrl && { label: "Regulations", type: "regulations", url: item.regulationsUrl, sourceName: item.sourceName },
    ...normalizeArray(item.externalLinks).map((link) => ({
      label: link.label,
      type: link.type || "external",
      url: link.url,
      sourceName: link.sourceName || item.sourceName
    }))
  ]);

  return {
    title: item.title,
    slug: existing?.slug || (await makeUniqueEventSlug(item.title, existing?._id)),
    dedupeKey: item.dedupeKey || "",
    description: item.description || "",
    organizer: existing?.organizer || organizer._id,
    city: item.city || "Online",
    venueName: item.venue || "",
    address: item.address || "",
    startDate,
    endDate,
    status: "published",
    registrationStatus: item.registrationUrl ? "open" : "closed",
    timeControl: item.timeControl && item.timeControl !== "unknown" ? item.timeControl : "",
    country: item.country || "",
    ratingType: allowedEventRatingTypes.has(item.ratingType) ? item.ratingType : "",
    sourceOrganizerName: item.sourceOrganizerName || "",
    websiteUrl: firstString(item.websiteUrl, item.registrationUrl, item.sourceUrl, ""),
    resultsUrl: item.resultsUrl || "",
    regulationsUrl: item.regulationsUrl || "",
    source: {
      name: item.sourceName || "",
      url: item.sourceUrl || "",
      originalId: item.originalId || "",
      lastCheckedAt: asDate(item.lastCheckedAt),
      detailLastCheckedAt: asDate(item.lastCheckedAt),
      detailStatus: normalizeArray(item.qualityFlags).length ? "partial" : "complete"
    },
    externalLinks,
    dataQualityScore: Math.round((item.confidence || 0) * 100),
    isPublic: true
  };
};

const mapNews = async (item, existing = null) => ({
  title: item.title,
  slug: existing?.slug || (await makeUniqueNewsSlug(item.title, item.slug, existing?._id)),
  summary: item.summary,
  summaryType: item.summaryType || "generated",
  sourceName: item.sourceName,
  sourceHomeUrl: originFromUrl(item.canonicalUrl || item.sourceUrl),
  sourceUrl: item.sourceUrl,
  canonicalUrl: item.canonicalUrl || item.sourceUrl,
  url: item.canonicalUrl || item.sourceUrl,
  author: item.author || "",
  publishedAt: asDate(item.publishedAt),
  updatedAt: asDate(item.updatedAt),
  language: item.language || "other",
  region: item.region || "",
  category: item.category || "other",
  imageUrl: item.imageUrl || "",
  tags: normalizeArray(item.tags),
  relatedTournamentId: item.relatedTournamentId || "",
  relatedTournamentName: item.relatedTournamentName || "",
  relatedPlayerIds: normalizeArray(item.relatedPlayerIds),
  relatedPlayerNames: normalizeArray(item.relatedPlayerNames),
  relatedCoverage: normalizeArray(item.relatedCoverage),
  originalId: item.originalId || "",
  contentHash: item.contentHash || "",
  dedupeKey: item.dedupeKey || "",
  confidence: item.confidence || 0,
  qualityFlags: normalizeArray(item.qualityFlags),
  evidenceRefs: normalizeArray(item.evidenceRefs).map((ref) => ({
    ...ref,
    capturedAt: asDate(ref.capturedAt)
  })),
  sourceLastCheckedAt: asDate(item.lastCheckedAt),
  approvedAt: asDate(item.approvedAt),
  approvedBy: item.approvedBy || "",
  publishStatus: "ready",
  isPublic: true
});

const ingestTournaments = async ({ items, dryRun = false }) => {
  const result = { created: [], updated: [], skipped: [], rejected: [], errors: [] };
  const organizer = dryRun ? null : await findAgentOrganizer();
  if (!dryRun && !organizer) {
    result.errors.push({ message: "No admin or organizer user available for agent tournament ingest" });
    return result;
  }

  for (const item of items) {
    try {
      const reasons = ensureReady(item, { minConfidence: TOURNAMENT_CONFIDENCE_MIN, blockingFlags: COMMON_BLOCKING_FLAGS });
      const query = tournamentQuery(item);
      if (!query) reasons.push("missing dedupe key, original id, and source URL");
      if (!item.title || !item.startDate || !item.country || !item.sourceName || !item.sourceUrl) {
        reasons.push("missing required tournament fields");
      }
      if (reasons.length) {
        result.rejected.push({ title: item.title || "", dedupeKey: item.dedupeKey || "", reasons });
        continue;
      }

      const existing = await Event.findOne(query);
      if (dryRun) {
        (existing ? result.updated : result.created).push({
          title: item.title,
          dedupeKey: item.dedupeKey,
          action: existing ? "would_update" : "would_create"
        });
        continue;
      }

      const payload = await mapTournament(item, organizer, existing);
      if (existing) {
        Object.assign(existing, payload);
        await existing.save();
        result.updated.push({ id: String(existing._id), title: existing.title, dedupeKey: existing.dedupeKey });
      } else {
        const event = await Event.create(payload);
        result.created.push({ id: String(event._id), title: event.title, dedupeKey: event.dedupeKey });
      }
    } catch (error) {
      result.errors.push({ title: item.title || "", message: error.message });
    }
  }

  return result;
};

const ingestNews = async ({ items, dryRun = false }) => {
  const result = { created: [], updated: [], skipped: [], rejected: [], errors: [] };

  for (const item of items) {
    try {
      const reasons = ensureReady(item, { minConfidence: NEWS_CONFIDENCE_MIN, blockingFlags: NEWS_BLOCKING_FLAGS });
      const query = newsQuery(item);
      if (!query) reasons.push("missing dedupe key, canonical URL, source URL, original id, and content hash");
      if (!item.title || !item.slug || !item.summary || !item.sourceName || !item.sourceUrl || !item.canonicalUrl) {
        reasons.push("missing required news fields");
      }
      if (reasons.length) {
        result.rejected.push({ title: item.title || "", dedupeKey: item.dedupeKey || "", reasons });
        continue;
      }

      const existing = await NewsItem.findOne(query);
      if (dryRun) {
        (existing ? result.updated : result.created).push({
          title: item.title,
          dedupeKey: item.dedupeKey,
          action: existing ? "would_update" : "would_create"
        });
        continue;
      }

      const payload = await mapNews(item, existing);
      if (existing) {
        Object.assign(existing, payload);
        await existing.save();
        result.updated.push({ id: String(existing._id), title: existing.title, dedupeKey: existing.dedupeKey });
      } else {
        const newsItem = await NewsItem.create(payload);
        result.created.push({ id: String(newsItem._id), title: newsItem.title, dedupeKey: newsItem.dedupeKey });
      }
    } catch (error) {
      result.errors.push({ title: item.title || "", message: error.message });
    }
  }

  return result;
};

module.exports = {
  ingestNews,
  ingestTournaments,
  NEWS_BLOCKING_FLAGS,
  NEWS_CONFIDENCE_MIN,
  TOURNAMENT_CONFIDENCE_MIN
};
