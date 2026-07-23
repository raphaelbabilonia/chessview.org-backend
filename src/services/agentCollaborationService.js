const crypto = require("crypto");
const AgentSubmission = require("../models/AgentSubmission");
const Event = require("../models/Event");
const NewsItem = require("../models/NewsItem");
const { ingestNews, ingestTournaments } = require("./agentIngestService");
const { REQUIRED_NEWS_IMAGE_REASON, hasRequiredNewsImage } = require("../utils/newsImagePolicy");
const slugify = require("../utils/slugify");
const { chessviewApiUrl } = require("../utils/chessviewApiUrl");

const EVENT_AUTO_CONFIDENCE_MIN = 0.85;
const NEWS_AUTO_CONFIDENCE_MIN = 0.82;
const NEWS_MAX_AGE_DAYS = 45;
const DEFAULT_REVIEW_LIMIT = 250;
const FULL_TEXT_FIELDS = ["articleBody", "bodyHtml", "content", "fullText"];
const BLOCKING_FLAGS = new Set([
  "legal_review_required",
  "low_confidence",
  "duplicate_possible",
  "source_requires_manual_check",
  "paywall_detected",
  "primary_source_missing",
  "discovery_only_source"
]);

const MAX_METADATA_DEPTH = 5;
const MAX_METADATA_ARRAY_LENGTH = 80;
const MAX_METADATA_STRING_LENGTH = 1600;

const isPlainObject = (value) =>
  value && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

const trimString = (value, max = 500) => (typeof value === "string" ? value.trim().slice(0, max) : "");

const firstString = (...values) => values.map((value) => trimString(value, 2000)).find(Boolean) || "";

const normalizeArray = (value) => (Array.isArray(value) ? value : []);

const asDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const isoDate = (value) => {
  const date = asDate(value);
  return date ? date.toISOString() : "";
};

const datePart = (value) => {
  const date = asDate(value);
  return date ? date.toISOString().slice(0, 10) : "unknown";
};

const startOfUtcDay = (value = new Date()) =>
  new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));

const originFromUrl = (value) => {
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
};

const isPrivateHostname = (hostname) => {
  const host = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) return true;

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return false;
  const octets = ipv4.slice(1).map(Number);
  if (octets.some((octet) => octet < 0 || octet > 255)) return true;
  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
};

const cleanUrl = (value, field, errors, { required = false } = {}) => {
  const text = trimString(value, 2000);
  if (!text) {
    if (required) errors.push(`${field} is required`);
    return "";
  }

  try {
    const url = new URL(text);
    if (!["http:", "https:"].includes(url.protocol)) {
      errors.push(`${field} must use http or https`);
      return "";
    }
    if (isPrivateHostname(url.hostname)) {
      errors.push(`${field} must not point to localhost or private networks`);
      return "";
    }
    url.hash = "";
    return url.toString();
  } catch {
    errors.push(`${field} must be a valid URL`);
    return "";
  }
};

const cleanStringArray = (value, maxItems = 20, maxLength = 120) =>
  normalizeArray(value)
    .map((item) => trimString(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);

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

const sanitizeMetadata = (value) => {
  const metadata = sanitizeMetadataValue(value || {});
  return isPlainObject(metadata) ? metadata : {};
};

const cleanEvidenceRefs = (refs, fallbackUrl, checkedAt) => {
  const cleaned = normalizeArray(refs)
    .slice(0, 20)
    .map((ref, index) => {
      if (!isPlainObject(ref)) return null;
      const urlErrors = [];
      const sourceUrl = cleanUrl(ref.sourceUrl || fallbackUrl, "evidenceRefs.sourceUrl", urlErrors);
      const canonicalUrl = cleanUrl(ref.canonicalUrl || "", "evidenceRefs.canonicalUrl", urlErrors);
      return {
        refId: trimString(ref.refId, 120) || `source-${index + 1}`,
        path: trimString(ref.path, 500),
        sourceUrl,
        canonicalUrl,
        capturedAt: isoDate(ref.capturedAt) || checkedAt,
        excerpt: trimString(ref.excerpt, 600),
        notes: trimString(ref.notes, 600)
      };
    })
    .filter((ref) => ref && (ref.sourceUrl || ref.excerpt));

  if (cleaned.length > 0 || !fallbackUrl) return cleaned;
  return [
    {
      refId: "source-1",
      sourceUrl: fallbackUrl,
      canonicalUrl: fallbackUrl,
      capturedAt: checkedAt,
      excerpt: "",
      notes: "Source URL supplied by a public agent submission."
    }
  ];
};

const finiteConfidence = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 1 ? number : 0;
};

const hashJson = (value) =>
  crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

const hashRequestValue = (value) => {
  const salt = process.env.AGENT_COLLABORATION_SALT || (process.env.NODE_ENV === "development" ? process.env.TRACKING_SALT : "");
  if (!salt || !value) return "";
  return crypto.createHmac("sha256", salt).update(String(value)).digest("hex");
};

const requestMeta = (req) => ({
  ipHash: hashRequestValue(req.ip || req.socket?.remoteAddress || ""),
  userAgentHash: hashRequestValue(req.get("user-agent") || ""),
  origin: trimString(req.get("origin"), 300)
});

const normalizeAgent = (agent = {}) => {
  const errors = [];
  return {
    name: trimString(agent.name, 120) || "unknown-agent",
    version: trimString(agent.version, 80),
    url: cleanUrl(agent.url, "agent.url", errors),
    contact: trimString(agent.contact, 200),
    repositoryUrl: cleanUrl(agent.repositoryUrl, "agent.repositoryUrl", errors)
  };
};

const rejectFullTextFields = (item, errors) => {
  for (const field of FULL_TEXT_FIELDS) {
    if (item[field] !== undefined && item[field] !== null && String(item[field]).trim()) {
      errors.push(`${field} is not accepted; submit short source-first metadata only`);
    }
  }
};

const normalizeExternalLinks = (links, errors) =>
  normalizeArray(links)
    .slice(0, 20)
    .map((link) => {
      const url = cleanUrl(link?.url, "externalLinks.url", errors);
      if (!url) return null;
      return {
        label: trimString(link.label, 120),
        type: trimString(link.type, 80) || "external",
        url,
        sourceName: trimString(link.sourceName, 180)
      };
    })
    .filter(Boolean);

const normalizeEventSubmission = (item, checkedAt) => {
  const errors = [];
  rejectFullTextFields(item, errors);

  const title = trimString(item.title, 220);
  const startDate = isoDate(item.startDate);
  const endDate = isoDate(item.endDate) || startDate;
  const country = trimString(item.country, 120);
  const city = trimString(item.city, 160);
  const sourceName = trimString(item.sourceName, 180);
  const sourceUrl = cleanUrl(firstString(item.sourceUrl, item.websiteUrl), "sourceUrl", errors, { required: true });
  const websiteUrl = cleanUrl(firstString(item.websiteUrl, sourceUrl), "websiteUrl", errors);
  const registrationUrl = cleanUrl(item.registrationUrl, "registrationUrl", errors);
  const resultsUrl = cleanUrl(item.resultsUrl, "resultsUrl", errors);
  const regulationsUrl = cleanUrl(item.regulationsUrl, "regulationsUrl", errors);
  const externalLinks = normalizeExternalLinks(item.externalLinks, errors);

  if (!title) errors.push("title is required");
  if (!startDate) errors.push("startDate is required and must be a valid date");
  if (!country) errors.push("country is required");
  if (!city) errors.push("city is required");
  if (!sourceName) errors.push("sourceName is required");

  const confidence = finiteConfidence(item.confidence);
  const qualityFlags = cleanStringArray(item.qualityFlags);
  const dedupeKey =
    trimString(item.dedupeKey, 300) || `${country.toLowerCase()}|${city.toLowerCase()}|${datePart(startDate)}|${slugify(title)}`;
  const normalized = {
    schemaVersion: 1,
    title,
    description: trimString(item.description, 4000),
    startDate,
    endDate,
    country,
    region: trimString(item.region, 120),
    city,
    venue: firstString(item.venue, item.venueName),
    address: trimString(item.address, 500),
    timeControl: trimString(item.timeControl, 120),
    ratingType: ["", "FIDE", "national", "unrated"].includes(item.ratingType) ? item.ratingType : "",
    sourceName,
    sourceUrl,
    websiteUrl,
    registrationUrl,
    resultsUrl,
    regulationsUrl,
    externalLinks,
    metadata: sanitizeMetadata(item.metadata),
    originalId: trimString(item.originalId, 240),
    confidence,
    qualityFlags,
    evidenceRefs: cleanEvidenceRefs(item.evidenceRefs, sourceUrl, checkedAt),
    dedupeKey,
    lastCheckedAt: checkedAt,
    publishStatus: "ready"
  };
  normalized.contentHash = trimString(item.contentHash, 160) || hashJson({ kind: "event", ...normalized });

  return { kind: "event", normalized, errors };
};

const normalizeNewsSubmission = (item, checkedAt) => {
  const errors = [];
  rejectFullTextFields(item, errors);

  const title = trimString(item.title, 220);
  const summary = trimString(item.summary, 900);
  const sourceName = trimString(item.sourceName, 180);
  const sourceUrl = cleanUrl(item.sourceUrl, "sourceUrl", errors, { required: true });
  const canonicalUrl = cleanUrl(firstString(item.canonicalUrl, item.sourceUrl), "canonicalUrl", errors, { required: true });
  const imageUrl = cleanUrl(item.imageUrl, "imageUrl", errors, { required: true });
  const publishedAt = isoDate(item.publishedAt);

  if (!title) errors.push("title is required");
  if (!summary) errors.push("summary is required");
  if (!sourceName) errors.push("sourceName is required");
  if (!publishedAt) errors.push("publishedAt is required and must be a valid date");
  if (imageUrl && !hasRequiredNewsImage(imageUrl)) errors.push(REQUIRED_NEWS_IMAGE_REASON);

  const confidence = finiteConfidence(item.confidence);
  const qualityFlags = cleanStringArray(item.qualityFlags);
  const slug = trimString(item.slug, 140) || slugify(title || canonicalUrl, { fallback: "news", maxLength: 120 });
  const dedupeKey = trimString(item.dedupeKey, 300) || `${datePart(publishedAt)}|${slug}`;
  const normalized = {
    schemaVersion: 1,
    title,
    slug,
    summary,
    summaryType: "generated",
    sourceName,
    sourceHomeUrl: cleanUrl(item.sourceHomeUrl, "sourceHomeUrl", errors) || originFromUrl(canonicalUrl || sourceUrl),
    sourceUrl,
    canonicalUrl,
    url: canonicalUrl || sourceUrl,
    author: trimString(item.author, 180),
    publishedAt,
    updatedAt: isoDate(item.updatedAt),
    language: trimString(item.language, 24) || "other",
    region: trimString(item.region, 120),
    category: trimString(item.category, 80) || "other",
    imageUrl,
    tags: cleanStringArray(item.tags, 20, 80),
    relatedTournamentName: trimString(item.relatedTournamentName, 220),
    relatedPlayerNames: cleanStringArray(item.relatedPlayerNames, 20, 160),
    relatedCoverage: normalizeArray(item.relatedCoverage).slice(0, 20),
    originalId: trimString(item.originalId, 240),
    confidence,
    qualityFlags,
    evidenceRefs: cleanEvidenceRefs(item.evidenceRefs, sourceUrl || canonicalUrl, checkedAt),
    dedupeKey,
    lastCheckedAt: checkedAt,
    sourceLastCheckedAt: checkedAt,
    publishStatus: "ready"
  };
  normalized.contentHash = trimString(item.contentHash, 160) || hashJson({ kind: "news", ...normalized });

  return { kind: "news", normalized, errors };
};

const normalizeSubmissionItem = (item, checkedAt = new Date().toISOString()) => {
  if (item.kind === "event" || item.kind === "tournament") return normalizeEventSubmission(item, checkedAt);
  return normalizeNewsSubmission(item, checkedAt);
};

const queuePublicSubmissions = async ({ parsed, req }) => {
  const checkedAt = new Date().toISOString();
  const dryRun = parsed.dryRun === true;
  const runId = trimString(parsed.runId, 180);
  const agent = normalizeAgent(parsed.agent || {});
  const request = requestMeta(req);
  const queued = [];
  const rejected = [];

  for (let index = 0; index < parsed.items.length; index += 1) {
    const item = parsed.items[index];
    const { kind, normalized, errors } = normalizeSubmissionItem(item, checkedAt);
    if (errors.length) {
      rejected.push({ index, kind, title: item.title || "", reasons: [...new Set(errors)] });
      continue;
    }

    if (dryRun) {
      queued.push({
        index,
        kind,
        title: normalized.title,
        dedupeKey: normalized.dedupeKey,
        action: "would_queue"
      });
      continue;
    }

    const existing = await AgentSubmission.findOne({ kind, contentHash: normalized.contentHash }).lean();
    if (existing) {
      queued.push({
        index,
        kind,
        title: normalized.title,
        submissionId: existing.submissionId,
        status: existing.status,
        duplicate: true
      });
      continue;
    }

    const submission = await AgentSubmission.create({
      submissionId: crypto.randomUUID(),
      kind,
      status: "queued",
      runId,
      agent,
      item,
      normalized,
      dedupeKey: normalized.dedupeKey,
      contentHash: normalized.contentHash,
      confidence: normalized.confidence,
      qualityFlags: normalized.qualityFlags,
      evidenceRefs: normalized.evidenceRefs,
      request
    });

    queued.push({
      index,
      kind,
      title: normalized.title,
      submissionId: submission.submissionId,
      status: submission.status,
      dedupeKey: submission.dedupeKey
    });
  }

  return {
    dryRun,
    runId,
    queued,
    rejected,
    meta: {
      queued: queued.length,
      rejected: rejected.length,
      total: parsed.items.length
    }
  };
};

const publicSubmissionStatus = (submission) => ({
  submissionId: submission.submissionId,
  kind: submission.kind,
  status: submission.status,
  title: submission.normalized?.title || "",
  dedupeKey: submission.dedupeKey || "",
  runId: submission.runId || "",
  confidence: submission.confidence || 0,
  qualityFlags: submission.qualityFlags || [],
  decision: {
    reviewedAt: submission.decision?.reviewedAt || null,
    reasons: submission.decision?.reasons || [],
    publishedAt: submission.decision?.publishedAt || null
  },
  createdAt: submission.createdAt,
  updatedAt: submission.updatedAt
});

const hasBlockingFlag = (submission) => normalizeArray(submission.qualityFlags).some((flag) => BLOCKING_FLAGS.has(flag));

const eventDuplicateExists = async (item) => {
  const clauses = [];
  if (item.dedupeKey) clauses.push({ dedupeKey: item.dedupeKey });
  if (item.sourceUrl) clauses.push({ "source.url": item.sourceUrl });
  if (item.originalId) clauses.push({ "source.originalId": item.originalId });
  return clauses.length ? Boolean(await Event.findOne({ $or: clauses }).select("_id").lean()) : false;
};

const newsDuplicateExists = async (item) => {
  const clauses = [];
  if (item.dedupeKey) clauses.push({ dedupeKey: item.dedupeKey });
  if (item.canonicalUrl) clauses.push({ canonicalUrl: item.canonicalUrl });
  if (item.sourceUrl) clauses.push({ sourceUrl: item.sourceUrl });
  if (item.originalId) clauses.push({ originalId: item.originalId });
  if (item.contentHash) clauses.push({ contentHash: item.contentHash });
  return clauses.length ? Boolean(await NewsItem.findOne({ $or: clauses }).select("_id").lean()) : false;
};

const decideSubmission = async (submission, now = new Date()) => {
  const item = submission.normalized || {};
  const reasons = [];

  if (submission.kind === "event") {
    if (submission.confidence < EVENT_AUTO_CONFIDENCE_MIN) reasons.push(`confidence below ${EVENT_AUTO_CONFIDENCE_MIN}`);
    if (hasBlockingFlag(submission)) reasons.push("blocking quality flag present");
    if (!item.title || !item.startDate || !item.endDate || !item.country || !item.city || !item.sourceName || !item.sourceUrl) {
      reasons.push("missing required event fields");
    }
    if (asDate(item.endDate) < startOfUtcDay(now)) reasons.push("event is already past");
    if (await eventDuplicateExists(item)) reasons.push("duplicate event already exists");

    if (reasons.length === 0) return { action: "shared_review", reasons: ["queued for the shared Sol tournament review pipeline"] };
    const status = reasons.some((reason) => reason.includes("confidence") || reason.includes("quality flag"))
      ? "quarantined"
      : "rejected";
    return { action: status, reasons };
  }

  if (submission.confidence < NEWS_AUTO_CONFIDENCE_MIN) reasons.push(`confidence below ${NEWS_AUTO_CONFIDENCE_MIN}`);
  if (hasBlockingFlag(submission)) reasons.push("blocking quality flag present");
  if (!item.title || !item.summary || !item.sourceName || !item.sourceUrl || !item.canonicalUrl || !item.imageUrl) {
    reasons.push("missing required news fields");
  }
  if (!hasRequiredNewsImage(item.imageUrl)) reasons.push(REQUIRED_NEWS_IMAGE_REASON);
  const publishedAt = asDate(item.publishedAt);
  if (!publishedAt) {
    reasons.push("publishedAt is missing or invalid");
  } else {
    const cutoff = new Date(now.getTime() - NEWS_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
    if (publishedAt < cutoff) reasons.push(`news is older than ${NEWS_MAX_AGE_DAYS} days`);
  }
  if (await newsDuplicateExists(item)) reasons.push("duplicate news already exists");

  if (reasons.length === 0) return { action: "publish", reasons: ["accepted for weekly auto-publication"] };
  const status = reasons.some((reason) => reason.includes("confidence") || reason.includes("quality flag"))
    ? "quarantined"
    : "rejected";
  return { action: status, reasons };
};

const markDecision = async (submission, { status, reasons, reviewRunId, publishResult = {}, error = "", publishedAt = null }) => {
  submission.status = status;
  submission.decision = {
    reviewedAt: new Date(),
    reviewRunId,
    reasons,
    publishedAt,
    publishResult,
    error
  };
  await submission.save();
};

const publishItemFor = (submission, now) => ({
  ...submission.normalized,
  publishStatus: "ready",
  approvedAt: now.toISOString(),
  approvedBy: "public-agent-auto-review",
  lastCheckedAt: now.toISOString(),
  sourceLastCheckedAt: now.toISOString()
});

const directPublisher = async ({ events, news, dryRun }) => ({
  events: await ingestTournaments({ items: events, dryRun }),
  news: await ingestNews({ items: news, dryRun })
});

const matchPublishOutcome = (result = {}, item) => {
  const createdOrUpdated = [...(result.created || []), ...(result.updated || [])].find(
    (entry) => entry.dedupeKey === item.dedupeKey || entry.title === item.title
  );
  if (createdOrUpdated) return { status: "published", reasons: ["published through private ingest"], publishResult: createdOrUpdated };

  const rejected = (result.rejected || []).find((entry) => entry.dedupeKey === item.dedupeKey || entry.title === item.title);
  if (rejected) return { status: "failed", reasons: rejected.reasons || ["private ingest rejected item"], publishResult: rejected };

  const error = (result.errors || []).find((entry) => entry.title === item.title);
  if (error) return { status: "failed", reasons: [error.message || "private ingest failed"], publishResult: error };

  if (result.success) return { status: "published", reasons: ["private ingest completed"], publishResult: result.meta || {} };
  return { status: "failed", reasons: ["private ingest did not confirm publication"], publishResult: result.meta || {} };
};

const reviewPublicAgentSubmissions = async ({
  dryRun = true,
  now = new Date(),
  limit = DEFAULT_REVIEW_LIMIT,
  publisher = directPublisher,
  reviewRunId = `public-agent-review-${new Date().toISOString()}`
} = {}) => {
  const submissions = await AgentSubmission.find({ status: "queued" }).sort({ createdAt: 1 }).limit(limit);
  const accepted = [];
  const deferredEvents = [];
  const reviewed = [];
  const events = [];
  const news = [];

  for (const submission of submissions) {
    const decision = await decideSubmission(submission, now);
    if (decision.action === "shared_review") {
      deferredEvents.push({ submissionId: submission.submissionId, title: submission.normalized?.title || "", reasons: decision.reasons });
      reviewed.push({ submissionId: submission.submissionId, kind: submission.kind, action: "shared_review", reasons: decision.reasons });
      continue;
    }
    if (decision.action === "publish") {
      const item = publishItemFor(submission, now);
      accepted.push({ submission, item, reasons: decision.reasons });
      if (submission.kind === "event") events.push(item);
      if (submission.kind === "news") news.push(item);
      reviewed.push({ submissionId: submission.submissionId, kind: submission.kind, action: "publish", reasons: decision.reasons });
      continue;
    }

    reviewed.push({
      submissionId: submission.submissionId,
      kind: submission.kind,
      action: decision.action,
      reasons: decision.reasons
    });
    if (!dryRun) {
      await markDecision(submission, {
        status: decision.action,
        reasons: decision.reasons,
        reviewRunId
      });
    }
  }

  const publishResults = dryRun || accepted.length === 0 ? { events: {}, news: {} } : await publisher({ events, news, dryRun, reviewRunId });

  if (!dryRun) {
    for (const entry of accepted) {
      const result = entry.submission.kind === "event" ? publishResults.events : publishResults.news;
      const outcome = matchPublishOutcome(result, entry.item);
      await markDecision(entry.submission, {
        status: outcome.status,
        reasons: outcome.reasons,
        reviewRunId,
        publishResult: outcome.publishResult,
        publishedAt: outcome.status === "published" ? new Date() : null
      });
    }
  }

  return {
    success: true,
    dryRun,
    reviewRunId,
    scanned: submissions.length,
    accepted: accepted.length,
    deferredEvents,
    reviewed,
    publishMeta: {
      events: publishResults.events?.meta || {},
      news: publishResults.news?.meta || {}
    }
  };
};

const postJson = async ({ url, token, body }) => {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Agent-Publish-Token": token
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}: ${payload.message || response.statusText}`);
  }
  return payload;
};

const makeHttpPublisher = ({ apiBaseUrl, token }) => {
  const base = String(apiBaseUrl || "");
  if (!base) throw new Error("Missing CHESSVIEW_API_BASE_URL");
  if (!token) throw new Error("Missing AGENT_PUBLISH_TOKEN or CHESSVIEW_AGENT_PUBLISH_TOKEN");

  return async ({ events, news, dryRun, reviewRunId }) => ({
    events: events.length
      ? await postJson({
          url: chessviewApiUrl(base, "/agent-ingest/tournaments"),
          token,
          body: { dryRun, runId: reviewRunId, items: events }
        })
      : { success: true, meta: { created: 0, updated: 0, rejected: 0, errors: 0 }, created: [], updated: [], rejected: [], errors: [] },
    news: news.length
      ? await postJson({
          url: chessviewApiUrl(base, "/agent-ingest/news"),
          token,
          body: { dryRun, runId: reviewRunId, items: news }
        })
      : { success: true, meta: { created: 0, updated: 0, rejected: 0, errors: 0 }, created: [], updated: [], rejected: [], errors: [] }
  });
};

module.exports = {
  BLOCKING_FLAGS,
  EVENT_AUTO_CONFIDENCE_MIN,
  NEWS_AUTO_CONFIDENCE_MIN,
  NEWS_MAX_AGE_DAYS,
  decideSubmission,
  makeHttpPublisher,
  normalizeSubmissionItem,
  publicSubmissionStatus,
  queuePublicSubmissions,
  reviewPublicAgentSubmissions
};
