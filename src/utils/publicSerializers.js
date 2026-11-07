const { safeHttpUrl, safeLinks } = require("./safeUrl");

const toPlain = (value) => (value?.toObject ? value.toObject() : value || null);

const publicOrganizer = (organizer) => {
  const value = toPlain(organizer);
  if (!value) return null;
  return {
    _id: value._id,
    name: value.name || ""
  };
};

const publicPlayer = (player) => {
  const value = toPlain(player);
  if (!value) return null;
  return {
    _id: value._id,
    event: value.event,
    section: value.section,
    firstName: value.firstName || "",
    lastName: value.lastName || "",
    federation: value.federation || "",
    club: value.club || "",
    rating: value.rating || 0,
    fideId: value.fideId || "",
    title: value.title || "",
    gender: value.gender || "",
    nationalRating: value.nationalRating || 0,
    fideK: value.fideK || 0,
    nationalK: value.nationalK || 0,
    performanceRating: value.performanceRating || 0,
    ratingChange: value.ratingChange ?? null,
    sourceRank: value.sourceRank || 0,
    sourcePoints: value.sourcePoints || 0,
    sourceRankedId: value.sourceRankedId || 0,
    sourceTieBreaks: value.sourceTieBreaks || [],
    sourceMatches: value.sourceMatches || [],
    status: value.status || "active",
    source: value.source || {},
    createdAt: value.createdAt,
    updatedAt: value.updatedAt
  };
};

// Old records can hold links from before ingest checked them; never publish those.
const publicEventLinks = (event) => ({
  websiteUrl: safeHttpUrl(event.websiteUrl),
  resultsUrl: safeHttpUrl(event.resultsUrl),
  regulationsUrl: safeHttpUrl(event.regulationsUrl),
  source: { ...(event.source || {}), url: safeHttpUrl(event.source?.url) },
  externalLinks: safeLinks(event.externalLinks)
});

const isPlainObject = (value) =>
  value && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

const hasObjectData = (value) => isPlainObject(value) && Object.keys(value).length > 0;

const hasArrayData = (value) => Array.isArray(value) && value.length > 0;

const metadataSummaryFor = (metadata = {}) => {
  if (!hasObjectData(metadata)) {
    return {
      enrichmentStatus: "none",
      factsCount: 0,
      hasRegistration: false,
      hasSchedule: false,
      hasPrizes: false,
      hasPlayerField: false,
      hasHistoricalData: false,
      sourcesCount: 0
    };
  }

  const sourcesVisited = metadata.sourceAudit?.sourcesVisited;
  const factsCount = [
    hasObjectData(metadata.format),
    hasObjectData(metadata.registration),
    hasObjectData(metadata.logistics),
    hasArrayData(metadata.schedule),
    hasObjectData(metadata.prizes),
    hasObjectData(metadata.playerField),
    hasArrayData(metadata.historicalEditions),
    hasArrayData(metadata.extraFacts)
  ].filter(Boolean).length;

  return {
    enrichmentStatus: metadata.enrichmentStatus || "partial",
    factsCount,
    hasRegistration: hasObjectData(metadata.registration),
    hasSchedule: hasArrayData(metadata.schedule),
    hasPrizes: hasObjectData(metadata.prizes),
    hasPlayerField: hasObjectData(metadata.playerField),
    hasHistoricalData: hasArrayData(metadata.historicalEditions),
    sourcesCount: hasArrayData(sourcesVisited) ? sourcesVisited.length : 0,
    lastEnrichedAt: metadata.sourceAudit?.extractedAt || metadata.lastEnrichedAt || null
  };
};

const eventListItem = (event) => {
  const value = toPlain(event);
  if (!value) return null;
  const links = publicEventLinks(value);
  return {
    _id: value._id,
    title: value.title || "",
    slug: value.slug || "",
    description: value.description || "",
    city: value.city || "",
    venueName: value.venueName || "",
    address: value.address || "",
    startDate: value.startDate,
    endDate: value.endDate,
    status: value.status || "draft",
    registrationStatus: value.registrationStatus || "closed",
    timeControl: value.timeControl || "",
    country: value.country || "",
    region: value.region || "",
    location: value.location || {},
    sourceOrganizerName: value.sourceOrganizerName || "",
    ...links,
    externalLinks: links.externalLinks.slice(0, 20),
    dataQualityScore: value.dataQualityScore || 0,
    metadataSummary: metadataSummaryFor(value.metadata),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt
  };
};

// The website builds its sitemap from this rule: a page is worth indexing when it
// points somewhere real, and an old event only while its results remain useful.
const isIndexableEvent = (event, now = new Date()) => {
  if (!event?.title || !event?.slug || !event?.startDate || !event?.endDate) return false;
  const hasLocation = Boolean(event.city || event.country || event.location?.city || event.metadata?.logistics?.city);
  const hasSource = Boolean(
    event.websiteUrl ||
      event.resultsUrl ||
      event.regulationsUrl ||
      event.source?.url ||
      (event.externalLinks || []).some((link) => link?.url)
  );
  if (!hasLocation || !hasSource) return false;
  const endDate = new Date(event.endDate);
  if (Number.isNaN(endDate.getTime())) return false;
  const oneYearAgo = new Date(now);
  oneYearAgo.setUTCFullYear(oneYearAgo.getUTCFullYear() - 1);
  return endDate >= oneYearAgo || Boolean(event.resultsUrl);
};

module.exports = {
  eventListItem,
  isIndexableEvent,
  metadataSummaryFor,
  publicEventLinks,
  publicOrganizer,
  publicPlayer
};
