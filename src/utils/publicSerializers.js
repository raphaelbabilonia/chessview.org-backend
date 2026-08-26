const toPlain = (value) => (value?.toObject ? value.toObject() : value || null);

const internalOrganizerPattern = /(?:chess\s*view.*agent|agent.*publisher)/i;

const publicOrganizer = (organizer, sourceOrganizerName = "") => {
  const sourceName = String(sourceOrganizerName || "").trim();
  if (sourceName) return { name: sourceName };
  const value = toPlain(organizer);
  if (!value) return null;
  const name = String(value.name || "").trim();
  if (!name || internalOrganizerPattern.test(name)) return null;
  return {
    _id: value._id,
    name
  };
};

const publicSource = (source) => {
  const value = toPlain(source);
  if (!value) return {};
  return {
    name: value.name || "",
    url: value.url || "",
    lastCheckedAt: value.lastCheckedAt || null,
    detailLastCheckedAt: value.detailLastCheckedAt || null
  };
};

const publicLocation = (location) => {
  const value = toPlain(location);
  if (!value) return {};
  return {
    city: value.city || "",
    region: value.region || "",
    country: value.country || "",
    latitude: Number.isFinite(value.latitude) ? value.latitude : null,
    longitude: Number.isFinite(value.longitude) ? value.longitude : null,
    ...(Array.isArray(value.coordinates) && value.coordinates.length >= 2
      ? { coordinates: value.coordinates.slice(0, 2) }
      : {})
  };
};

const publicExternalLinks = (links) =>
  (Array.isArray(links) ? links : [])
    .filter((link) => link && link.url)
    .slice(0, 20)
    .map((link) => ({
      label: link.label || "",
      type: link.type || "",
      url: link.url,
      sourceName: link.sourceName || ""
    }));

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
    status: value.status || "active",
    createdAt: value.createdAt,
    updatedAt: value.updatedAt
  };
};

const isPlainObject = (value) =>
  value && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

const hasObjectData = (value) => isPlainObject(value) && Object.keys(value).length > 0;

const hasArrayData = (value) => Array.isArray(value) && value.length > 0;

const clonePublicValue = (value) => {
  if (value === null || value === undefined) return value;
  if (["string", "number", "boolean"].includes(typeof value)) return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.slice(0, 100).map(clonePublicValue);
  if (!isPlainObject(value)) return undefined;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !key.startsWith("_") && !/^(?:sourceAudit|reviewEvidence|internal|raw|debug|error|runId)$/i.test(key))
      .map(([key, entry]) => [key, clonePublicValue(entry)])
      .filter(([, entry]) => entry !== undefined)
  );
};

const publicMetadata = (metadata = {}) => {
  if (!hasObjectData(metadata)) return {};
  const result = {};
  for (const key of [
    "summary",
    "enrichmentStatus",
    "lastEnrichedAt",
    "format",
    "registration",
    "logistics",
    "schedule",
    "prizes",
    "playerField",
    "historicalEditions",
    "extraFacts"
  ]) {
    const value = clonePublicValue(metadata[key]);
    if (value !== undefined && value !== "" && (!Array.isArray(value) || value.length) && (!isPlainObject(value) || Object.keys(value).length)) {
      result[key] = value;
    }
  }
  return result;
};

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
    location: publicLocation(value.location),
    sourceOrganizerName: value.sourceOrganizerName || "",
    websiteUrl: value.websiteUrl || "",
    resultsUrl: value.resultsUrl || "",
    regulationsUrl: value.regulationsUrl || "",
    source: publicSource(value.source),
    externalLinks: publicExternalLinks(value.externalLinks),
    dataQualityScore: value.dataQualityScore || 0,
    metadataSummary: metadataSummaryFor(value.metadata),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt
  };
};

const publicSection = (section) => {
  const value = toPlain(section);
  if (!value) return null;
  return {
    _id: value._id,
    event: value.event,
    name: value.name || "",
    description: value.description || "",
    maxPlayers: value.maxPlayers || 0,
    ratingMin: value.ratingMin ?? null,
    ratingMax: value.ratingMax ?? null,
    birthYearMin: value.birthYearMin ?? null,
    birthYearMax: value.birthYearMax ?? null,
    timeControl: value.timeControl || "",
    roundsCount: value.roundsCount || 0,
    pairingSystem: value.pairingSystem || "",
    scoringSystem: value.scoringSystem || "",
    ratingRule: value.ratingRule || "",
    sourceTieBreaks: value.sourceTieBreaks || [],
    tieBreakRating: value.tieBreakRating || 0,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt
  };
};

const publicRound = (round) => {
  const value = toPlain(round);
  if (!value) return null;
  return {
    _id: value._id,
    event: value.event,
    section: value.section,
    number: value.number,
    name: value.name || "",
    startsAt: value.startsAt || null,
    status: value.status || "draft",
    createdAt: value.createdAt,
    updatedAt: value.updatedAt
  };
};

const publicPairing = (pairing) => {
  const value = toPlain(pairing);
  if (!value) return null;
  return {
    _id: value._id,
    event: value.event,
    section: value.section,
    round: value.round,
    boardNumber: value.boardNumber,
    whitePlayer: value.whitePlayer,
    blackPlayer: value.blackPlayer,
    result: value.result || "pending",
    sourceWhitePoints: value.sourceWhitePoints ?? null,
    sourceBlackPoints: value.sourceBlackPoints ?? null,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt
  };
};

const publicDocument = (document) => {
  const value = toPlain(document);
  if (!value) return null;
  return {
    _id: value._id,
    event: value.event,
    label: value.label || "",
    type: value.type || "other",
    url: value.url || "",
    localUrl: value.localUrl || "",
    mimeType: value.mimeType || "",
    sizeBytes: value.sizeBytes || 0,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt
  };
};

const publicEventDetail = (event) => {
  const value = toPlain(event);
  if (!value) return null;
  return {
    ...eventListItem(value),
    ratingType: value.ratingType || "",
    maxPlayers: value.maxPlayers || 0,
    contactEmail: value.contactEmail || "",
    contactPhone: value.contactPhone || "",
    organizer: publicOrganizer(value.organizer, value.sourceOrganizerName),
    metadata: publicMetadata(value.metadata)
  };
};

const isIndexableEvent = (event, now = new Date()) => {
  const value = toPlain(event);
  if (!value?.title || !value?.slug || !value?.startDate || !value?.endDate) return false;
  const hasLocation = Boolean(value.city || value.country || value.location?.city || value.metadata?.logistics?.city);
  const hasSource = Boolean(
    value.websiteUrl ||
      value.resultsUrl ||
      value.regulationsUrl ||
      value.source?.url ||
      (value.externalLinks || []).some((link) => link?.url)
  );
  if (!hasLocation || !hasSource) return false;
  const endDate = new Date(value.endDate);
  if (Number.isNaN(endDate.getTime())) return false;
  if (endDate >= now) return true;
  const oneYearAgo = new Date(now);
  oneYearAgo.setUTCFullYear(oneYearAgo.getUTCFullYear() - 1);
  if (endDate >= oneYearAgo) return true;
  return Boolean(value.resultsUrl || metadataSummaryFor(value.metadata).factsCount >= 2);
};

module.exports = {
  eventListItem,
  isIndexableEvent,
  metadataSummaryFor,
  publicDocument,
  publicEventDetail,
  publicExternalLinks,
  publicLocation,
  publicMetadata,
  publicOrganizer,
  publicPairing,
  publicPlayer,
  publicRound,
  publicSection,
  publicSource
};
