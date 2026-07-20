const crypto = require("crypto");

const FAMILY_NOISE_WORDS = new Set([
  "blitz",
  "bullet",
  "classical",
  "open",
  "rapid",
  "standard",
  "torneo",
  "tournament",
  "turnier"
]);

const normalizeText = (value) =>
  String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

const datePart = (value) => {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value).slice(0, 10) : parsed.toISOString().slice(0, 10);
};

const titleFamily = (value) =>
  normalizeText(value)
    .split(" ")
    .filter((word) => word && !FAMILY_NOISE_WORDS.has(word))
    .join(" ");

const normalizeUrl = (value) => {
  try {
    const parsed = new URL(value);
    parsed.hash = "";
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$)/i.test(key)) parsed.searchParams.delete(key);
    }
    parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    return parsed.toString();
  } catch {
    return "";
  }
};

const stableValue = (value) => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object" || value instanceof Date) return value;
  return Object.keys(value)
    .sort()
    .reduce((result, key) => {
      if (value[key] !== undefined) result[key] = stableValue(value[key]);
      return result;
    }, {});
};

const VOLATILE_AUDIT_KEYS = new Set([
  "approvedAt",
  "capturedAt",
  "checkedAt",
  "extractedAt",
  "generatedAt",
  "lastCheckedAt",
  "reviewedAt",
  "runId"
]);

const stableContentValue = (value) => {
  if (Array.isArray(value)) return value.map(stableContentValue);
  if (!value || typeof value !== "object" || value instanceof Date) return value;
  return Object.keys(value)
    .filter((key) => !VOLATILE_AUDIT_KEYS.has(key))
    .sort()
    .reduce((result, key) => {
      if (value[key] !== undefined) result[key] = stableContentValue(value[key]);
      return result;
    }, {});
};

const sha256 = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");

const comparableTournament = (item = {}) => ({
  title: String(item.title || "").trim(),
  startDate: datePart(item.startDate),
  endDate: datePart(item.endDate || item.startDate),
  country: String(item.country || "").trim(),
  city: String(item.city || item.location?.city || "").trim(),
  venue: String(item.venue || item.venueName || "").trim(),
  address: String(item.address || "").trim(),
  timeControl: String(item.timeControl || "").trim(),
  ratingType: String(item.ratingType || "").trim(),
  registrationStatus: String(item.registrationStatus || "").trim(),
  websiteUrl: normalizeUrl(item.websiteUrl),
  resultsUrl: normalizeUrl(item.resultsUrl),
  regulationsUrl: normalizeUrl(item.regulationsUrl),
  externalLinks: (Array.isArray(item.externalLinks) ? item.externalLinks : [])
    .map((link) => ({ label: String(link?.label || "").trim(), url: normalizeUrl(link?.url) }))
    .filter((link) => link.url)
    .sort((left, right) => left.url.localeCompare(right.url)),
  metadata: item.metadata && typeof item.metadata === "object" ? item.metadata : {}
});

const canonicalFamilySignature = (item = {}) => {
  const comparable = comparableTournament(item);
  return [
    normalizeText(comparable.country),
    normalizeText(comparable.city),
    comparable.startDate,
    comparable.endDate,
    normalizeText(comparable.venue),
    titleFamily(comparable.title)
  ].join("|");
};

const canonicalFamilyKey = (item = {}) => {
  const signature = canonicalFamilySignature(item);
  if (!signature.replace(/\|/g, "")) return "";
  return `family:v1:${sha256(signature)}`;
};

const tournamentContentHash = (item = {}) =>
  `sha256:${sha256(JSON.stringify(stableContentValue(comparableTournament(item))))}`;

const tournamentSourceKeys = (item = {}) => {
  const keys = new Set(
    (Array.isArray(item.sourceKeys) ? item.sourceKeys : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  );
  const sourceName = normalizeText(item.sourceName || item.source?.name);
  const originalId = String(item.originalId || item.source?.originalId || "").trim();
  const sourceUrl = normalizeUrl(item.sourceUrl || item.source?.url);

  if (sourceName && originalId) keys.add(`source:${sourceName}:id:${originalId}`);
  if (sourceName && sourceUrl && !originalId) keys.add(`source:${sourceName}:url:${sourceUrl}`);
  return [...keys].sort();
};

const tokenSet = (value) => new Set(titleFamily(value).split(" ").filter(Boolean));

const titleSimilarity = (left, right) => {
  const leftTokens = tokenSet(left);
  const rightTokens = tokenSet(right);
  if (!leftTokens.size || !rightTokens.size) return 0;
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union ? intersection / union : 0;
};

const familySimilarity = (candidate = {}, existing = {}) => {
  if (datePart(candidate.startDate) !== datePart(existing.startDate)) return 0;

  const candidateCountry = normalizeText(candidate.country);
  const existingCountry = normalizeText(existing.country || existing.location?.country);
  const candidateCity = normalizeText(candidate.city || candidate.location?.city);
  const existingCity = normalizeText(existing.city || existing.location?.city);
  if (candidateCountry && existingCountry && candidateCountry !== existingCountry) return 0;
  if (candidateCity && existingCity && candidateCity !== existingCity) return 0;

  let score = 0.25;
  if (candidateCountry && candidateCountry === existingCountry) score += 0.1;
  if (candidateCity && candidateCity === existingCity) score += 0.15;
  if (datePart(candidate.endDate || candidate.startDate) === datePart(existing.endDate || existing.startDate)) score += 0.1;

  const candidateVenue = normalizeText(candidate.venue || candidate.venueName);
  const existingVenue = normalizeText(existing.venue || existing.venueName);
  if (candidateVenue && existingVenue && candidateVenue === existingVenue) score += 0.1;

  score += titleSimilarity(candidate.title, existing.title) * 0.4;
  return Math.min(1, score);
};

const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

module.exports = {
  canonicalFamilyKey,
  canonicalFamilySignature,
  comparableTournament,
  datePart,
  escapeRegex,
  familySimilarity,
  normalizeText,
  normalizeUrl,
  titleFamily,
  tournamentContentHash,
  tournamentSourceKeys
};
