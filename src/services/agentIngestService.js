const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const Event = require("../models/Event");
const NewsItem = require("../models/NewsItem");
const User = require("../models/User");
const { REQUIRED_NEWS_IMAGE_REASON, hasRequiredNewsImage } = require("../utils/newsImagePolicy");
const slugify = require("../utils/slugify");
const { isSyntheticTestEvent } = require("../utils/syntheticTestEvents");

const TOURNAMENT_CONFIDENCE_MIN = 0.75;
const NEWS_CONFIDENCE_MIN = 0.7;

const COMMON_BLOCKING_FLAGS = new Set([
  "legal_review_required",
  "low_confidence",
  "duplicate_possible",
  "source_requires_manual_check"
]);

const NEWS_BLOCKING_FLAGS = new Set([
  "legal_review_required",
  "low_confidence",
  "duplicate_possible",
  "paywall_detected",
  "primary_source_missing",
  "discovery_only_source"
]);

const allowedEventRatingTypes = new Set(["FIDE", "national", "unrated"]);
const MAX_METADATA_DEPTH = 6;
const MAX_METADATA_ARRAY_LENGTH = 120;
const MAX_METADATA_STRING_LENGTH = 2500;

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

const trimString = (value) => (typeof value === "string" ? value.trim() : "");

const datePart = (value) => {
  const date = asDate(value);
  return date ? date.toISOString().slice(0, 10) : "unknown";
};

const finiteNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const hashNewsContent = (item) =>
  crypto
    .createHash("sha256")
    .update([item.canonicalUrl, item.title, item.summary, item.publishedAt || ""].join("|"))
    .digest("hex");

const sourceNameFromUrl = (value) => {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

const isPlainObject = (value) =>
  value && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

const sanitizeMetadataValue = (value, depth = 0) => {
  if (depth > MAX_METADATA_DEPTH) return undefined;
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return value.trim().slice(0, MAX_METADATA_STRING_LENGTH);
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_METADATA_ARRAY_LENGTH)
      .map((item) => sanitizeMetadataValue(item, depth + 1))
      .filter((item) => item !== undefined && item !== "");
  }
  if (!isPlainObject(value)) return undefined;

  return Object.entries(value).reduce((result, [key, entryValue]) => {
    if (!key || key.startsWith("$") || key.includes(".")) return result;
    const cleanValue = sanitizeMetadataValue(entryValue, depth + 1);
    if (cleanValue === undefined || cleanValue === "") return result;
    if (Array.isArray(cleanValue) && cleanValue.length === 0) return result;
    if (isPlainObject(cleanValue) && Object.keys(cleanValue).length === 0) return result;
    result[key] = cleanValue;
    return result;
  }, {});
};

const normalizeTournamentMetadata = (item) => {
  const metadata = sanitizeMetadataValue(item.metadata || {});
  if (!isPlainObject(metadata) || Object.keys(metadata).length === 0) return {};

  return {
    enrichmentStatus: metadata.enrichmentStatus || "partial",
    summary: metadata.summary || "",
    format: isPlainObject(metadata.format) ? metadata.format : {},
    registration: isPlainObject(metadata.registration) ? metadata.registration : {},
    logistics: isPlainObject(metadata.logistics) ? metadata.logistics : {},
    schedule: Array.isArray(metadata.schedule) ? metadata.schedule : [],
    prizes: isPlainObject(metadata.prizes) ? metadata.prizes : {},
    playerField: isPlainObject(metadata.playerField) ? metadata.playerField : {},
    historicalEditions: Array.isArray(metadata.historicalEditions) ? metadata.historicalEditions : [],
    sourceAudit: isPlainObject(metadata.sourceAudit) ? metadata.sourceAudit : {},
    extraFacts: Array.isArray(metadata.extraFacts) ? metadata.extraFacts : []
  };
};

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

const normalizeNewsInput = (item = {}) => {
  const sourceUrl = firstString(item.sourceUrl, item.url, item.canonicalUrl, "");
  const canonicalUrl = firstString(item.canonicalUrl, item.url, item.sourceUrl, "");
  const title = trimString(item.title);
  const sourceName = firstString(item.sourceName, sourceNameFromUrl(sourceUrl), "Unknown source");
  const slug = trimString(item.slug) || slugify(title || canonicalUrl || sourceName, { fallback: "news", maxLength: 120 });
  const summary =
    firstString(item.summary, item.description, item.excerpt) ||
    `${sourceName} reports ${title || "a chess news update"}. Open the original article for the full report, photos, updates, and source context.`;
  const publishedAt = asDate(item.publishedAt);
  const checkedAt = asDate(item.lastCheckedAt, new Date());
  const dedupeKey = trimString(item.dedupeKey) || `${datePart(publishedAt || checkedAt)}|${slug}`;
  const normalized = {
    ...item,
    title,
    slug,
    summary,
    sourceName,
    sourceHomeUrl: firstString(item.sourceHomeUrl, originFromUrl(canonicalUrl || sourceUrl)),
    sourceUrl,
    canonicalUrl,
    url: canonicalUrl || sourceUrl,
    publishedAt,
    updatedAt: asDate(item.updatedAt),
    language: trimString(item.language) || "other",
    region: trimString(item.region),
    category: trimString(item.category) || "other",
    imageUrl: trimString(item.imageUrl),
    tags: normalizeArray(item.tags).map(trimString).filter(Boolean),
    relatedPlayerIds: normalizeArray(item.relatedPlayerIds).map(trimString).filter(Boolean),
    relatedPlayerNames: normalizeArray(item.relatedPlayerNames).map(trimString).filter(Boolean),
    relatedCoverage: normalizeArray(item.relatedCoverage),
    confidence: finiteNumber(item.confidence, 0.75),
    qualityFlags: normalizeArray(item.qualityFlags).map(trimString).filter(Boolean),
    evidenceRefs: normalizeArray(item.evidenceRefs),
    dedupeKey,
    sourceLastCheckedAt: checkedAt,
    lastCheckedAt: checkedAt,
    approvedAt: asDate(item.approvedAt),
    approvedBy: trimString(item.approvedBy),
    publishStatus: trimString(item.publishStatus) || "ready"
  };

  normalized.contentHash = trimString(item.contentHash) || hashNewsContent(normalized);
  if (normalized.evidenceRefs.length === 0 && normalized.sourceUrl) {
    normalized.evidenceRefs = [
      {
        refId: "source-1",
        sourceUrl: normalized.sourceUrl,
        canonicalUrl: normalized.canonicalUrl,
        capturedAt: normalized.lastCheckedAt,
        excerpt: normalized.summary.slice(0, 240),
        notes: "Created from source-provided metadata during agent ingest."
      }
    ];
  }

  return normalized;
};

const mapTournament = async (item, organizer, existing = null) => {
  const startDate = asDate(item.startDate);
  const endDate = asDate(item.endDate, startDate);
  const metadata = normalizeTournamentMetadata(item);
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
    metadata: Object.keys(metadata).length ? metadata : existing?.metadata || {},
    dataQualityScore: Math.round((item.confidence || 0) * 100),
    isPublic: true
  };
};

const mapNews = async (item, existing = null) => {
  const normalized = normalizeNewsInput(item);

  return {
    title: normalized.title,
    slug: existing?.slug || (await makeUniqueNewsSlug(normalized.title, normalized.slug, existing?._id)),
    summary: normalized.summary,
    summaryType: normalized.summaryType || "generated",
    sourceName: normalized.sourceName,
    sourceHomeUrl: normalized.sourceHomeUrl,
    sourceUrl: normalized.sourceUrl,
    canonicalUrl: normalized.canonicalUrl,
    url: normalized.url,
    author: normalized.author || "",
    publishedAt: normalized.publishedAt,
    updatedAt: normalized.updatedAt,
    language: normalized.language,
    region: normalized.region || "",
    category: normalized.category,
    imageUrl: normalized.imageUrl,
    tags: normalized.tags,
    relatedTournamentId: normalized.relatedTournamentId || "",
    relatedTournamentName: normalized.relatedTournamentName || "",
    relatedPlayerIds: normalized.relatedPlayerIds,
    relatedPlayerNames: normalized.relatedPlayerNames,
    relatedCoverage: normalized.relatedCoverage,
    originalId: normalized.originalId || "",
    contentHash: normalized.contentHash,
    dedupeKey: normalized.dedupeKey,
    confidence: normalized.confidence,
    qualityFlags: normalized.qualityFlags,
    evidenceRefs: normalized.evidenceRefs.map((ref) => ({
    ...ref,
    capturedAt: asDate(ref.capturedAt)
  })),
    sourceLastCheckedAt: normalized.sourceLastCheckedAt,
    approvedAt: normalized.approvedAt,
    approvedBy: normalized.approvedBy,
    publishStatus: "ready",
    isPublic: true
  };
};

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
      if (isSyntheticTestEvent(item)) reasons.push("synthetic/local test fixture is not allowed in production ingest");
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
      const normalized = normalizeNewsInput(item);
      const reasons = ensureReady(normalized, { minConfidence: NEWS_CONFIDENCE_MIN, blockingFlags: NEWS_BLOCKING_FLAGS });
      const query = newsQuery(normalized);
      if (!query) reasons.push("missing dedupe key, canonical URL, source URL, original id, and content hash");
      if (!hasRequiredNewsImage(normalized.imageUrl)) reasons.push(REQUIRED_NEWS_IMAGE_REASON);
      if (!normalized.title || !normalized.summary || !normalized.sourceName || !normalized.sourceUrl || !normalized.canonicalUrl) {
        reasons.push("missing required news fields");
      }
      if (reasons.length) {
        result.rejected.push({ title: normalized.title || "", dedupeKey: normalized.dedupeKey || "", reasons });
        continue;
      }

      const existing = await NewsItem.findOne(query);
      if (dryRun) {
        (existing ? result.updated : result.created).push({
          title: normalized.title,
          dedupeKey: normalized.dedupeKey,
          action: existing ? "would_update" : "would_create"
        });
        continue;
      }

      const payload = await mapNews(normalized, existing);
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
