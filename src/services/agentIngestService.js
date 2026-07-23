const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const Event = require("../models/Event");
const NewsItem = require("../models/NewsItem");
const User = require("../models/User");
const { REQUIRED_NEWS_IMAGE_REASON, hasRequiredNewsImage } = require("../utils/newsImagePolicy");
const slugify = require("../utils/slugify");
const { isSyntheticTestEvent } = require("../utils/syntheticTestEvents");
const { canonicalCountryName } = require("../utils/countryNames");
const {
  canonicalFamilyKey,
  escapeRegex,
  familySimilarity,
  normalizeText,
  normalizeUrl,
  tournamentContentHash,
  tournamentSourceKeys
} = require("../utils/tournamentIdentity");

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
const allowedRegistrationStatuses = new Set(["closed", "open", "full"]);
const allowedLifecycleStatuses = new Set(["scheduled", "postponed", "cancelled", "completed"]);
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
    schemaVersion: metadata.schemaVersion === 2 ? 2 : 1,
    enrichmentStatus: metadata.enrichmentStatus || "partial",
    summary: metadata.summary || "",
    lifecycle: isPlainObject(metadata.lifecycle) ? metadata.lifecycle : {},
    classification: isPlainObject(metadata.classification) ? metadata.classification : {},
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
  if (item.sourceKeys?.length) clauses.push({ sourceKeys: { $in: item.sourceKeys } });
  if (item.dedupeKey) clauses.push({ dedupeKey: item.dedupeKey });
  if (item.originalId && item.sourceName) {
    clauses.push({
      "source.name": { $regex: `^${escapeRegex(item.sourceName)}$`, $options: "i" },
      "source.originalId": item.originalId
    });
  }
  // A listing URL is not an event identity when the source supplies a stable id.
  // Federation calendars can legitimately expose every event from one list page;
  // matching those records by URL makes later items overwrite the first one.
  if (item.sourceUrl && !item.originalId) clauses.push({ "source.url": item.sourceUrl });
  if (clauses.length === 0) return null;
  return { $or: clauses };
};

const tournamentSourceIdentity = (item = {}) => {
  const sourceName = normalizeText(item.sourceName || item.source?.name);
  const originalId = trimString(item.originalId || item.source?.originalId);
  const sourceUrl = normalizeUrl(item.sourceUrl || item.source?.url);
  if (sourceName && originalId) return `${sourceName}|id:${originalId}`;
  if (sourceName && sourceUrl) return `${sourceName}|url:${sourceUrl}`;
  return "";
};

const batchIdentityCollisions = (items = []) => {
  const byListingUrl = new Map();
  const reasons = new Map();

  for (const item of items) {
    const sourceName = normalizeText(item.sourceName || item.source?.name);
    const sourceUrl = normalizeUrl(item.sourceUrl || item.source?.url);
    const identity = tournamentSourceIdentity(item);
    if (!sourceName || !sourceUrl || !identity) continue;
    const key = `${sourceName}|${sourceUrl}`;
    if (!byListingUrl.has(key)) byListingUrl.set(key, new Set());
    byListingUrl.get(key).add(identity);
  }

  for (const [key, identities] of byListingUrl) {
    if (identities.size < 2) continue;
    const url = key.slice(key.indexOf("|") + 1);
    for (const identity of identities) {
      reasons.set(identity, `source URL collision: ${identities.size} distinct source identities share ${url}`);
    }
  }

  return reasons;
};

const mergeTournamentMetadata = (existingValue, incomingValue, { preferIncoming = true } = {}) => {
  const existing = isPlainObject(existingValue) ? existingValue : {};
  const incoming = isPlainObject(incomingValue) ? incomingValue : {};
  const populated = (value) =>
    value !== "" && value !== null && value !== undefined &&
    (!Array.isArray(value) || value.length > 0) &&
    (!isPlainObject(value) || Object.keys(value).length > 0);
  const stableKey = (value) => {
    if (!isPlainObject(value)) return JSON.stringify(value);
    return JSON.stringify(
      Object.keys(value)
        .sort()
        .reduce((result, key) => {
          result[key] = value[key];
          return result;
        }, {})
    );
  };
  const mergeValue = (left, right) => {
    if (Array.isArray(left) || Array.isArray(right)) {
      const seen = new Set();
      return [...(Array.isArray(left) ? left : []), ...(Array.isArray(right) ? right : [])].filter((value) => {
        const key = stableKey(value);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    if (isPlainObject(left) || isPlainObject(right)) {
      const leftObject = isPlainObject(left) ? left : {};
      const rightObject = isPlainObject(right) ? right : {};
      return [...new Set([...Object.keys(leftObject), ...Object.keys(rightObject)])].reduce((result, key) => {
        result[key] = mergeValue(leftObject[key], rightObject[key]);
        return result;
      }, {});
    }
    if (preferIncoming && populated(right)) return right;
    if (populated(left)) return left;
    return right;
  };

  return mergeValue(existing, incoming);
};

const sourceAuthority = (item = {}) => {
  const declared = normalizeText(item.metadata?.sourceAudit?.authority || item.metadata?.sourceAudit?.sourceRole);
  const name = normalizeText(item.sourceName || item.source?.name);
  if (declared === "organizer" || declared === "official organizer") return 600;
  if (declared === "federation" || declared === "official federation") return 500;
  if (declared === "platform" || declared === "official tournament platform") return 400;
  if (declared === "rating calendar" || declared === "official rating calendar") return 300;
  if (declared === "broadcast" || declared === "official broadcast") return 200;
  if (declared === "aggregator" || declared === "benchmark") return 100;
  if (/fide|federation|federscacchi|schachbund|english chess|us chess|echecs|schaakbond/.test(name)) return 500;
  if (/vesus|chessreg|chess results|info64|chessarbiter|tornelo|chessmanager/.test(name)) return 400;
  if (/lichess|broadcast/.test(name)) return 200;
  return 250;
};

const normalizeTournamentInput = (item = {}) => {
  const normalized = {
    ...item,
    title: trimString(item.title),
    sourceName: trimString(item.sourceName),
    sourceUrl: normalizeUrl(item.sourceUrl),
    originalId: trimString(item.originalId),
    city: trimString(item.city),
    country: canonicalCountryName(item.country),
    venue: trimString(item.venue || item.venueName),
    startDate: item.startDate,
    endDate: item.endDate || item.startDate,
    registrationStatus: trimString(item.registrationStatus || item.metadata?.registration?.status),
    lastCheckedAt: asDate(item.lastCheckedAt, new Date())
  };
  normalized.sourceKeys = [...new Set([
    ...tournamentSourceKeys(normalized),
    ...normalizeArray(item.sourceRefs).map((ref) => trimString(ref?.sourceKey)).filter(Boolean)
  ])];
  normalized.canonicalFamilyKey = canonicalFamilyKey(normalized);
  normalized.contentHash = trimString(item.contentHash) || tournamentContentHash(normalized);
  return normalized;
};

const sourceRefFor = (item) => ({
  sourceKey: tournamentSourceKeys({
    sourceName: item.sourceName,
    sourceUrl: item.sourceUrl,
    originalId: item.originalId
  })[0],
  name: item.sourceName,
  url: item.sourceUrl,
  originalId: item.originalId,
  lastCheckedAt: item.lastCheckedAt,
  contentHash: item.contentHash
});

const incomingSourceRefs = (item) => {
  const supplied = normalizeArray(item.sourceRefs).map((ref) => {
    const sourceKey = trimString(ref?.sourceKey) || tournamentSourceKeys({
      sourceName: ref?.name,
      sourceUrl: ref?.url,
      originalId: ref?.originalId
    })[0];
    return {
      sourceKey,
      name: trimString(ref?.name),
      url: normalizeUrl(ref?.url),
      originalId: trimString(ref?.originalId),
      lastCheckedAt: asDate(ref?.lastCheckedAt, item.lastCheckedAt),
      contentHash: trimString(ref?.contentHash)
    };
  }).filter((ref) => ref.sourceKey);
  const primarySourceKey = tournamentSourceKeys({
    sourceName: item.sourceName,
    sourceUrl: item.sourceUrl,
    originalId: item.originalId
  })[0];
  if (!supplied.some((ref) => ref.sourceKey === primarySourceKey)) supplied.push(sourceRefFor(item));
  return supplied;
};

const existingSourceRefs = (existing) => {
  const refs = normalizeArray(existing?.sourceRefs).map((ref) => ({
    sourceKey: ref.sourceKey,
    name: ref.name || "",
    url: ref.url || "",
    originalId: ref.originalId || "",
    lastCheckedAt: ref.lastCheckedAt || null,
    contentHash: ref.contentHash || ""
  }));
  if (!refs.length && existing?.source?.name && (existing.source.originalId || existing.source.url)) {
    const legacy = {
      sourceName: existing.source.name,
      sourceUrl: existing.source.url,
      originalId: existing.source.originalId
    };
    const keys = tournamentSourceKeys(legacy);
    if (keys.length) {
      refs.push({
        sourceKey: keys[0],
        name: legacy.sourceName,
        url: normalizeUrl(legacy.sourceUrl),
        originalId: legacy.originalId,
        lastCheckedAt: existing.source.lastCheckedAt || null,
        contentHash: ""
      });
    }
  }
  return refs;
};

const mergeSourceRefs = (existing, item) => {
  const refs = existingSourceRefs(existing);
  for (const incoming of incomingSourceRefs(item)) {
    const index = refs.findIndex(
      (ref) => ref.sourceKey === incoming.sourceKey ||
        (normalizeText(ref.name) === normalizeText(incoming.name) &&
          ((ref.originalId && ref.originalId === incoming.originalId) ||
            (normalizeUrl(ref.url) && normalizeUrl(ref.url) === normalizeUrl(incoming.url))))
    );
    if (index >= 0) refs[index] = { ...refs[index], ...incoming };
    else refs.push(incoming);
  }
  return refs;
};

const hasMatchingSourceHash = (existing, item) =>
  existingSourceRefs(existing).some(
    (ref) => item.sourceKeys.includes(ref.sourceKey) && ref.contentHash && ref.contentHash === item.contentHash
  );

const hasMatchingSource = (existing, item) => {
  const storedKeys = new Set(normalizeArray(existing?.sourceKeys));
  if (item.sourceKeys.some((key) => storedKeys.has(key))) return true;
  return normalizeText(existing?.source?.name) === normalizeText(item.sourceName) &&
    ((item.originalId && existing?.source?.originalId === item.originalId) ||
      (item.sourceUrl && normalizeUrl(existing?.source?.url) === item.sourceUrl));
};

const findTournamentMatch = async (item) => {
  const directQuery = tournamentQuery(item);
  const direct = directQuery ? await Event.findOne(directQuery) : null;
  if (direct) return { existing: direct, match: hasMatchingSource(direct, item) ? "source" : "family" };

  if (item.canonicalFamilyKey) {
    const familyMatches = await Event.find({ canonicalFamilyKey: item.canonicalFamilyKey }).limit(2);
    if (familyMatches.length === 1) return { existing: familyMatches[0], match: "family" };
    if (familyMatches.length > 1) return { ambiguous: familyMatches, match: "ambiguous" };
  }

  const start = asDate(item.startDate);
  if (!start) return { existing: null, match: "none" };
  const nextDay = new Date(start);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const candidates = await Event.find({
    startDate: { $gte: start, $lt: nextDay },
    ...(item.country ? { country: { $regex: `^${escapeRegex(item.country)}$`, $options: "i" } } : {})
  }).limit(25);
  const scored = candidates
    .map((existing) => ({ existing, score: familySimilarity(item, existing) }))
    .filter(({ score }) => score >= 0.68)
    .sort((left, right) => right.score - left.score);
  if (scored.length === 1 && scored[0].score >= 0.86) {
    return { existing: scored[0].existing, match: "family", score: scored[0].score };
  }
  if (scored.length) return { ambiguous: scored, match: "ambiguous" };
  return { existing: null, match: "none" };
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

const mapTournament = async (item, organizer, existing = null, { preservePrimary = false } = {}) => {
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

  const registrationStatus = allowedRegistrationStatuses.has(item.registrationStatus)
    ? item.registrationStatus
    : item.registrationUrl
      ? "open"
      : "closed";
  const lifecycleStatus = trimString(metadata.lifecycle?.status).toLowerCase();
  const eventStatus = allowedLifecycleStatuses.has(lifecycleStatus) && lifecycleStatus === "cancelled"
    ? "cancelled"
    : "published";
  const sourceKeys = [...new Set([...normalizeArray(existing?.sourceKeys), ...item.sourceKeys])].sort();
  const sourceRefs = mergeSourceRefs(existing, item);
  const incoming = {
    title: item.title,
    slug: existing?.slug || (await makeUniqueEventSlug(item.title, existing?._id)),
    dedupeKey: item.dedupeKey || "",
    canonicalFamilyKey: item.canonicalFamilyKey,
    sourceKeys,
    sourceRefs,
    description: item.description || "",
    organizer: existing?.organizer || organizer._id,
    city: item.city || "Online",
    venueName: item.venue || "",
    address: item.address || "",
    startDate,
    endDate,
    status: eventStatus,
    registrationStatus,
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
    metadata: Object.keys(metadata).length
      ? mergeTournamentMetadata(
        existing?.metadata?.toObject ? existing.metadata.toObject() : existing?.metadata,
        metadata,
        { preferIncoming: !preservePrimary }
      )
      : existing?.metadata || {},
    dataQualityScore: Math.round((item.confidence || 0) * 100),
    isPublic: true
  };

  if (!existing || !preservePrimary) {
    incoming.externalLinks = uniqueLinks([...normalizeArray(existing?.externalLinks), ...incoming.externalLinks]);
    return incoming;
  }

  return {
    ...incoming,
    title: existing.title || incoming.title,
    slug: existing.slug,
    dedupeKey: existing.dedupeKey || incoming.dedupeKey,
    description: existing.description || incoming.description,
    organizer: existing.organizer,
    city: existing.city || incoming.city,
    venueName: existing.venueName || incoming.venueName,
    address: existing.address || incoming.address,
    startDate: existing.startDate || incoming.startDate,
    endDate: existing.endDate || incoming.endDate,
    timeControl: existing.timeControl || incoming.timeControl,
    country: existing.country || incoming.country,
    ratingType: existing.ratingType || incoming.ratingType,
    sourceOrganizerName: existing.sourceOrganizerName || incoming.sourceOrganizerName,
    websiteUrl: existing.websiteUrl || incoming.websiteUrl,
    resultsUrl: existing.resultsUrl || incoming.resultsUrl,
    regulationsUrl: existing.regulationsUrl || incoming.regulationsUrl,
    source: existing.source,
    status: existing.status === "cancelled" || incoming.status === "cancelled" ? "cancelled" : existing.status || incoming.status,
    externalLinks: uniqueLinks([...normalizeArray(existing.externalLinks), ...incoming.externalLinks]),
    metadata: mergeTournamentMetadata(
      existing.metadata?.toObject ? existing.metadata.toObject() : existing.metadata,
      incoming.metadata,
      { preferIncoming: false }
    ),
    dataQualityScore: Math.max(existing.dataQualityScore || 0, incoming.dataQualityScore || 0)
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
  const result = { created: [], updated: [], merged: [], skipped: [], rejected: [], errors: [] };
  const organizer = dryRun ? null : await findAgentOrganizer();
  const normalizedItems = items.map(normalizeTournamentInput);
  const identityCollisions = batchIdentityCollisions(normalizedItems);
  const claimedTargets = new Map();
  if (!dryRun && !organizer) {
    result.errors.push({ message: "No admin or organizer user available for agent tournament ingest" });
    return result;
  }

  for (const item of normalizedItems) {
    try {
      const reasons = ensureReady(item, { minConfidence: TOURNAMENT_CONFIDENCE_MIN, blockingFlags: COMMON_BLOCKING_FLAGS });
      const sourceIdentity = tournamentSourceIdentity(item);
      if (identityCollisions.has(sourceIdentity)) reasons.push(identityCollisions.get(sourceIdentity));
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

      const found = await findTournamentMatch(item);
      if (found.match === "ambiguous") {
        result.rejected.push({
          title: item.title,
          dedupeKey: item.dedupeKey || "",
          reasons: ["ambiguous possible duplicate; manual review required"]
        });
        continue;
      }
      const existing = found.existing;
      if (existing) {
        const targetId = String(existing._id);
        const previousClaim = claimedTargets.get(targetId);
        if (previousClaim && previousClaim.sourceName === normalizeText(item.sourceName) && previousClaim.identity !== sourceIdentity) {
          result.rejected.push({
            title: item.title,
            dedupeKey: item.dedupeKey || "",
            reasons: [`same-target collision with ${previousClaim.title}; distinct identities from one source resolved to event ${targetId}`]
          });
          continue;
        }
        claimedTargets.set(targetId, {
          identity: sourceIdentity,
          sourceName: normalizeText(item.sourceName),
          title: item.title
        });
      }
      if (dryRun) {
        const target = existing ? (found.match === "family" ? result.merged : result.updated) : result.created;
        target.push({
          targetId: existing ? String(existing._id) : null,
          title: item.title,
          dedupeKey: item.dedupeKey,
          sourceIdentity,
          action: existing ? (found.match === "family" ? "would_merge" : "would_update") : "would_create"
        });
        continue;
      }

      if (existing && found.match === "source" && hasMatchingSourceHash(existing, item)) {
        result.skipped.push({ id: String(existing._id), title: existing.title, reason: "source content unchanged" });
        continue;
      }

      const preservePrimary = found.match === "family" && sourceAuthority(existing) >= sourceAuthority(item);
      const payload = await mapTournament(item, organizer, existing, { preservePrimary });
      if (existing) {
        Object.assign(existing, payload);
        await existing.save();
        const target = found.match === "family" ? result.merged : result.updated;
        target.push({ id: String(existing._id), title: existing.title, dedupeKey: existing.dedupeKey });
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
  batchIdentityCollisions,
  ingestNews,
  ingestTournaments,
  NEWS_BLOCKING_FLAGS,
  NEWS_CONFIDENCE_MIN,
  TOURNAMENT_CONFIDENCE_MIN,
  tournamentSourceIdentity
};
