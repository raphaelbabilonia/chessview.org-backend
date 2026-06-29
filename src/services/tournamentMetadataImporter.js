const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const Event = require("../models/Event");
const User = require("../models/User");
const { slugify } = require("../utils/slugify");

const DEFAULT_SOURCE_ORGANIZER_EMAIL = "sources@chessview.local";
const DEFAULT_SOURCE_ORGANIZER_NAME = "ChessView Sources";

const normalizeText = (value) =>
  String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(chess|tournament|torneo|scacchi)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const dateDay = (value) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
};

const buildDedupeKey = (tournament) => {
  const title = normalizeText(tournament.title).slice(0, 80);
  const start = dateDay(tournament.startDate);
  const city = normalizeText(tournament.city || "online").slice(0, 40);
  const country = normalizeText(tournament.country || "global").slice(0, 40);
  return [title, start, city, country].filter(Boolean).join("|");
};

const dataQualityScore = (tournament) => {
  const checks = [
    tournament.title,
    tournament.startDate,
    tournament.city,
    tournament.country,
    tournament.timeControl,
    tournament.sourceUrl,
    tournament.originalId,
    tournament.resultsUrl || tournament.registrationUrl
  ];

  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
};

const link = (type, label, url, sourceName) => {
  if (!url) return null;
  return {
    label,
    type,
    url,
    sourceName: sourceName || ""
  };
};

const externalLinksFor = (tournament) =>
  [
    link("source", "Original source", tournament.sourceUrl, tournament.sourceName),
    tournament.registrationUrl && tournament.registrationUrl !== tournament.sourceUrl
      ? link("website", "Official website", tournament.registrationUrl, tournament.sourceName)
      : null,
    link("results", "Results", tournament.resultsUrl, tournament.sourceName),
    link("regulations", "Regulations", tournament.regulationsUrl, tournament.sourceName)
  ].filter(Boolean);

const normalizeEventStatus = (value) => {
  const status = String(value || "").toLowerCase();
  return ["draft", "published", "completed", "cancelled"].includes(status) ? status : "published";
};

const normalizeRegistrationStatus = (value) => {
  const status = String(value || "").toLowerCase();
  return ["closed", "open", "full"].includes(status) ? status : "closed";
};

const mergeExternalLinks = (existing = [], incoming = []) => {
  const merged = new Map();
  [...existing, ...incoming].forEach((item) => {
    if (!item?.url) return;
    const key = String(item.url).toLowerCase();
    merged.set(key, {
      label: item.label || item.type || "Link",
      type: item.type || "",
      url: item.url,
      sourceName: item.sourceName || ""
    });
  });
  return [...merged.values()];
};

const legacyTruncatedSlug = (title) =>
  String(title || "event")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);

const shouldRefreshImportedSlug = (existing, title) => {
  if (!existing.slug) return true;
  const canonical = slugify(title);
  if (existing.slug === canonical) return false;
  if (existing.source?.name && existing.source?.originalId) return true;
  return existing.slug === legacyTruncatedSlug(title);
};

const ensureSourceOrganizer = async () => {
  const email = String(process.env.SCRAPER_ORGANIZER_EMAIL || DEFAULT_SOURCE_ORGANIZER_EMAIL).toLowerCase();
  const existing = await User.findOne({ email });
  if (existing) return existing;

  const passwordHash = await bcrypt.hash(`scraper-${crypto.randomUUID()}`, 10);
  return User.create({
    name: process.env.SCRAPER_ORGANIZER_NAME || DEFAULT_SOURCE_ORGANIZER_NAME,
    email,
    passwordHash,
    role: "organizer"
  });
};

const makeUniqueSlug = async (title, ignoreId = null) => {
  const base = slugify(title);
  let slug = base;
  let suffix = 2;

  const buildQuery = (candidate) =>
    ignoreId
      ? {
          slug: candidate,
          _id: { $ne: ignoreId }
        }
      : { slug: candidate };

  while (await Event.findOne(buildQuery(slug))) {
    slug = `${base}-${suffix++}`;
  }

  return slug;
};

const buildEventPayload = (tournament, organizer) => {
  const startDate = tournament.startDate ? new Date(tournament.startDate) : new Date();
  const endDate = tournament.endDate ? new Date(tournament.endDate) : startDate;

  return {
    title: tournament.title,
    dedupeKey: buildDedupeKey(tournament),
    description: tournament.description || "",
    organizer: organizer._id,
    city: tournament.city || "Online",
    country: tournament.country || "",
    venueName: tournament.venue || tournament.city || "",
    address: tournament.address || "",
    startDate,
    endDate,
    status: normalizeEventStatus(tournament.status),
    registrationStatus: normalizeRegistrationStatus(tournament.registrationStatus),
    timeControl: tournament.timeControl || "",
    ratingType: tournament.ratingType || "",
    maxPlayers: Number(tournament.maxPlayers || 0),
    contactEmail: tournament.contactEmail || "",
    websiteUrl: tournament.registrationUrl || tournament.sourceUrl || "",
    resultsUrl: tournament.resultsUrl || "",
    regulationsUrl: tournament.regulationsUrl || "",
    externalLinks: externalLinksFor(tournament),
    dataQualityScore: dataQualityScore(tournament),
    isPublic: true,
    source: {
      name: tournament.sourceName || "",
      url: tournament.sourceUrl || "",
      originalId: tournament.originalId || "",
      lastCheckedAt: tournament.lastCheckedAt ? new Date(tournament.lastCheckedAt) : new Date()
    }
  };
};

const findExistingEvent = async (tournament) => {
  if (tournament.sourceName && tournament.originalId) {
    return Event.findOne({
      "source.name": tournament.sourceName,
      "source.originalId": tournament.originalId
    });
  }

  const conditions = [];
  const dedupeKey = buildDedupeKey(tournament);

  if (tournament.sourceUrl) {
    conditions.push({ "source.url": tournament.sourceUrl });
    conditions.push({ "externalLinks.url": tournament.sourceUrl });
  }

  if (dedupeKey) {
    conditions.push({ dedupeKey });
  }

  if (!conditions.length) return null;
  return Event.findOne({ $or: conditions });
};

const upsertTournamentMetadata = async (tournament, { organizer } = {}) => {
  const sourceOrganizer = organizer || (await ensureSourceOrganizer());
  const payload = buildEventPayload(tournament, sourceOrganizer);
  const existing = await findExistingEvent(tournament);

  if (existing) {
    payload.source = {
      ...payload.source,
      detailLastCheckedAt: existing.source?.detailLastCheckedAt || null,
      detailStatus: existing.source?.detailStatus || "",
      detailError: existing.source?.detailError || "",
      detailStats: existing.source?.detailStats || {}
    };
    payload.externalLinks = mergeExternalLinks(
      (existing.externalLinks || []).filter((link) => !link.sourceName || link.sourceName !== tournament.sourceName),
      payload.externalLinks
    );
    const slug = shouldRefreshImportedSlug(existing, tournament.title)
      ? await makeUniqueSlug(tournament.title, existing._id)
      : existing.slug;
    Object.assign(existing, payload, {
      slug
    });
    await existing.save();
    return { action: "updated", event: existing };
  }

  const event = await Event.create({
    ...payload,
    slug: await makeUniqueSlug(tournament.title)
  });

  return { action: "created", event };
};

const importTournamentMetadata = async (tournaments) => {
  const organizer = await ensureSourceOrganizer();
  const results = [];

  for (const tournament of tournaments) {
    results.push(await upsertTournamentMetadata(tournament, { organizer }));
  }

  return {
    created: results.filter((result) => result.action === "created").length,
    updated: results.filter((result) => result.action === "updated").length,
    results: results.map((result) => ({
      action: result.action,
      id: String(result.event._id),
      slug: result.event.slug,
      title: result.event.title,
      sourceUrl: result.event.source?.url || ""
    }))
  };
};

module.exports = {
  buildDedupeKey,
  dataQualityScore,
  importTournamentMetadata,
  mergeExternalLinks,
  shouldRefreshImportedSlug,
  upsertTournamentMetadata
};
