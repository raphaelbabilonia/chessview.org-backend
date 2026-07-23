const fs = require("node:fs");
const path = require("node:path");
const { cleanCountry, resolveCuratedLocation } = require("../data/locationCoordinates");
const {
  coordinateIsValid,
  countryCodeFor,
  geocoderResultMatchesCountry
} = require("../utils/geocodingSafety");
const { normalizeApiRoot } = require("../utils/chessviewApiUrl");

const localEnvPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(localEnvPath)) {
  require("dotenv").config({ path: localEnvPath, quiet: true });
}
require("dotenv").config({ quiet: true });

const DEFAULT_GEOCODER_USER_AGENT = "ChessViewCoordinateBackfill/0.1 (https://chessview.org)";
const GEOCODE_CACHE_PATH = path.resolve(process.cwd(), "Codex Tournament Pipeline", "state", "coordinate-geocode-cache.json");
const NEGATIVE_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const GEOCODE_STRATEGY_VERSION = 4;
const GEOCODER_COUNTRY_ALIASES = {
  "chinese taipei": "Taiwan",
  england: "United Kingdom",
  "hong kong china": "Hong Kong",
  scotland: "United Kingdom",
  wales: "United Kingdom"
};
const ADMINISTRATIVE_LABELS = new Set([
  "andhra pradesh",
  "assam",
  "bihar",
  "delhi",
  "goa",
  "gujarat",
  "haryana",
  "karnataka",
  "kerala",
  "madhya pradesh",
  "maharashtra",
  "odisha",
  "punjab",
  "rajasthan",
  "raj",
  "sikkim",
  "tamil nadu",
  "telangana",
  "uttar pradesh",
  "uttarakhand",
  "west bengal"
]);
const PLACE_ALIASES = {
  caba: "Buenos Aires",
  dumiatt: "Damietta",
  ktm: "Kathmandu",
  mvd: "Montevideo"
};

const hasFlag = (name) => process.argv.includes(`--${name}`);

const argValue = (name, fallback = "") => {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
};

const parsePositiveInt = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
};

const apiRoot = () => {
  return normalizeApiRoot(process.env.CHESSVIEW_API_BASE_URL);
};

const agentToken = () => {
  const token = process.env.CHESSVIEW_AGENT_PUBLISH_TOKEN || process.env.AGENT_PUBLISH_TOKEN;
  if (!token) throw new Error("Missing CHESSVIEW_AGENT_PUBLISH_TOKEN");
  return token;
};

const todayIsoDate = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString().slice(0, 10);
};

const sleep = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

const hasLocationCoordinates = (event) => coordinateIsValid(event.location?.coordinates || []);

const cleanLocationPart = (value, { city = false } = {}) => {
  let text = String(value || "").normalize("NFKC").replace(/\s+/g, " ").trim();
  text = text
    .replace(/^(?:venue|address|location|city|town|municipality|region|state|province)\s*:\s*/i, "")
    .replace(/\b(?:postal\s*code|postcode|zip)\s*:?\s*[A-Z0-9 -]{3,10}\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (city) {
    text = text
      .replace(/^(?:г\.?|or\.?)\s+/iu, "")
      .replace(/^\d{4,6}\s*[,/-]?\s*/i, "")
      .replace(/\s*[,;|]\s*(?:\d{1,6}\b.*)$/i, "")
      .replace(/\s*\((?:online|virtual|venue tbc|tbc)\)\s*$/i, "")
      .trim();
  }
  return text;
};

const geocoderCountryFor = (country) => {
  const normalized = String(country || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return GEOCODER_COUNTRY_ALIASES[normalized] || country;
};

const normalizeLookupText = (value) => String(value || "")
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const geocoderSearchText = (city, country) => {
  const text = cleanLocationPart(city, { city: true });
  const countryCode = countryCodeFor(country);
  if (countryCode === "gb") {
    const postcode = text.match(/\b(?:GIR ?0AA|[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2})\b/i)?.[0];
    if (postcode) return postcode.toUpperCase().replace(/\s+/, " ");
  }

  const normalizedCountry = normalizeLookupText(country);
  const segments = text
    .replace(/[()[\]]/g, ",")
    .split(/[,;@|]+/)
    .map((part) => part.trim().replace(/^[/-]+|[/-]+$/g, "").trim())
    .filter(Boolean);

  const candidates = [];
  for (const segment of segments) {
    for (const part of segment.split(/\s+-\s+/)) {
      const containsStreetNumber = /\d/.test(part);
      const candidate = part
        .replace(/\b(?:postal\s*code|postcode|zip)\b.*$/i, "")
        .replace(/\b\d{4,6}(?:-\d{3,4})?\b.*$/i, "")
        .replace(/\s+/g, " ")
        .trim();
      const normalized = normalizeLookupText(candidate);
      if (!normalized || normalized === normalizedCountry || ADMINISTRATIVE_LABELS.has(normalized)) continue;
      if (/^[A-Z]{2,4}\.?$/.test(candidate) && !PLACE_ALIASES[normalized]) continue;
      if (/^(?:venue|location|different|various|verschiedene|tbc|online)$/i.test(candidate)) continue;
      if (/^(?:student|sports|community|conference|business|function|multipurpose)?\s*(?:centre|center|hall|building|school|club)$/i.test(candidate)) continue;
      if (!containsStreetNumber && candidate.length >= 3 && candidate.length <= 45 && !/https?:\/\//i.test(candidate)) {
        candidates.push(candidate);
      }
    }
  }

  const withoutFacilitySuffix = text
    .replace(/\s+(?:Klub Szachowy|Miejska (?:Publiczna )?Biblioteka|Szkoła Podstawowa|sala Magistrat|Sports? Hall|Chess (?:Club|Centre)|Community Centre)\b.*$/iu, "")
    .trim();
  if (withoutFacilitySuffix.length >= 3 && withoutFacilitySuffix.length <= 45) {
    candidates.unshift(withoutFacilitySuffix);
  }

  const aliasedCandidate = candidates.find((candidate) => PLACE_ALIASES[normalizeLookupText(candidate)]);
  if (aliasedCandidate) return PLACE_ALIASES[normalizeLookupText(aliasedCandidate)];

  const selected = candidates.reverse().find((candidate) => {
    const normalized = normalizeLookupText(candidate);
    return normalized && !ADMINISTRATIVE_LABELS.has(normalized);
  }) || text;
  return PLACE_ALIASES[normalizeLookupText(selected)] || selected;
};

const locationFromEvent = (event) => ({
  city: String(event.city || event.location?.city || "").trim(),
  country: cleanCountry(event.country || event.location?.country || ""),
  region: String(event.region || event.location?.region || "").trim(),
  queryCity: cleanLocationPart(event.city || event.location?.city || "", { city: true }),
  queryCountry: geocoderCountryFor(cleanCountry(event.country || event.location?.country || "")),
  queryRegion: cleanLocationPart(event.region || event.location?.region || "")
});

const geocodeLocation = async (location, { fetchImpl = fetch, userAgent }) => {
  const city = location.queryCity || cleanLocationPart(location.city, { city: true });
  const region = location.queryRegion || cleanLocationPart(location.region);
  const country = location.queryCountry || cleanCountry(location.country);
  const searchText = geocoderSearchText(city, country);
  const expectedCountryCode = countryCodeFor(country);
  const query = [searchText, region, expectedCountryCode ? "" : country].filter(Boolean).join(", ");
  if (!query) return null;

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "5");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("accept-language", "en");
  url.searchParams.set("q", query);
  if (expectedCountryCode) url.searchParams.set("countrycodes", expectedCountryCode);

  const response = await fetchImpl(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": userAgent
    }
  });

  if (!response.ok) {
    throw new Error(`Nominatim returned ${response.status} for ${query}`);
  }

  const results = await response.json();
  const match = Array.isArray(results)
    ? results.find((result) => geocoderResultMatchesCountry(result, country))
    : null;
  if (!match) return null;

  const coordinates = [Number(match.lon), Number(match.lat)];
  if (!coordinateIsValid(coordinates)) return null;

  return {
    city: location.city,
    country,
    region: location.region || "",
    coordinates,
    label: match.display_name || query,
    source: "nominatim",
    coordinateCountryCode: String(match.address?.country_code || "").toLowerCase()
  };
};

const readGeocodeCache = () => {
  if (!fs.existsSync(GEOCODE_CACHE_PATH)) {
    return { schemaVersion: 2, strategyVersion: GEOCODE_STRATEGY_VERSION, entries: {} };
  }
  try {
    const cache = JSON.parse(fs.readFileSync(GEOCODE_CACHE_PATH, "utf8"));
    return cache?.entries
      ? cache
      : { schemaVersion: 2, strategyVersion: GEOCODE_STRATEGY_VERSION, entries: {} };
  } catch {
    return { schemaVersion: 2, strategyVersion: GEOCODE_STRATEGY_VERSION, entries: {} };
  }
};

const writeGeocodeCache = (cache) => {
  fs.mkdirSync(path.dirname(GEOCODE_CACHE_PATH), { recursive: true });
  const temporary = `${GEOCODE_CACHE_PATH}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, GEOCODE_CACHE_PATH);
};

const eventIdentity = (event) => ({
  eventId: event._id,
  slug: event.slug,
  dedupeKey: event.dedupeKey,
  originalId: event.source?.originalId || "",
  sourceUrl: event.source?.url || "",
  title: event.title
});

const fetchEvents = async ({ activeFrom, baseUrl = apiRoot(), fetchImpl = fetch, maxPages = 100, pageSize = 100 }) => {
  const events = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const url = new URL(`${baseUrl}/events`);
    url.searchParams.set("activeFrom", activeFrom);
    url.searchParams.set("limit", String(pageSize));
    url.searchParams.set("page", String(page));
    const response = await fetchImpl(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": DEFAULT_GEOCODER_USER_AGENT
      }
    });

    if (!response.ok) throw new Error(`Event list returned ${response.status} on page ${page}`);
    const payload = await response.json();
    if (Array.isArray(payload.data)) events.push(...payload.data);

    if (!payload.meta?.hasNext) return events;
    if (page === maxPages) throw new Error(`Event list is truncated after ${maxPages} pages`);
  }

  return events;
};

const postCoordinateBatch = async ({ dryRun, items, runId }) => {
  const response = await fetch(`${apiRoot()}/agent-ingest/coordinates`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": DEFAULT_GEOCODER_USER_AGENT,
      "X-Agent-Publish-Token": agentToken()
    },
    body: JSON.stringify({ dryRun, items, runId })
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`Coordinate ingest returned ${response.status}: ${payload.message || JSON.stringify(payload).slice(0, 200)}`);
  }

  return payload;
};

const main = async () => {
  const apply = hasFlag("apply");
  const failOnMissing = hasFlag("fail-on-missing");
  const geocode = hasFlag("geocode") || String(process.env.GEOCODING_ENABLED || "").toLowerCase() === "true";
  const activeFrom = argValue("active-from", todayIsoDate());
  const maxGeocode = parsePositiveInt(argValue("max-geocode", process.env.GEOCODING_MAX_PER_RUN || "500"), 500);
  const delayMs = parsePositiveInt(argValue("delay-ms", process.env.GEOCODING_DELAY_MS || "1100"), 1100);
  const batchSize = parsePositiveInt(argValue("batch-size", "50"), 50);
  const userAgent = process.env.CHESSVIEW_GEOCODER_USER_AGENT || DEFAULT_GEOCODER_USER_AGENT;
  const events = await fetchEvents({ activeFrom });
  const eventId = argValue("event-id");
  const targetEvents = eventId
    ? events.filter((event) => String(event._id || "") === eventId || String(event.slug || "") === eventId)
    : events;
  const missingEvents = targetEvents.filter((event) => !hasLocationCoordinates(event));
  const updates = [];
  const unresolved = [];
  const resolutionCache = new Map();
  const durableCache = readGeocodeCache();
  let geocodeCalls = 0;

  for (const event of missingEvents) {
    const location = locationFromEvent(event);
    const locationKey = [`v${GEOCODE_STRATEGY_VERSION}`, location.queryCity, location.queryRegion, location.queryCountry]
      .map((value) => String(value || "").trim().toLowerCase())
      .join("|");
    let cachedResolution = resolutionCache.get(locationKey);
    const durable = durableCache.entries[locationKey];
    if (!cachedResolution && durable) {
      const wasNotAttempted = durable.reason === "geocode-limit-reached" || durable.reason === "geocoding-disabled";
      const negativeExpired = !durable.resolved && Date.now() - new Date(durable.checkedAt).getTime() > NEGATIVE_CACHE_TTL_MS;
      if (!wasNotAttempted && !negativeExpired) {
        cachedResolution = { reason: durable.reason, resolved: durable.resolved || null };
      }
    }

    if (!cachedResolution) {
      const curated = resolveCuratedLocation(location);
      let resolved = curated
        ? { ...curated, label: [curated.city, curated.region, curated.country].filter(Boolean).join(", "), source: "curated" }
        : null;
      let reason = "not-found";

      if (!resolved && geocode && geocodeCalls < maxGeocode && location.city && location.country) {
        if (geocodeCalls > 0) await sleep(delayMs);
        geocodeCalls += 1;
        resolved = await geocodeLocation(location, { userAgent });
      } else if (!resolved && !geocode) {
        reason = "geocoding-disabled";
      } else if (!resolved && geocodeCalls >= maxGeocode) {
        reason = "geocode-limit-reached";
      }

      cachedResolution = { reason, resolved };
      resolutionCache.set(locationKey, cachedResolution);
      if (resolved || reason === "not-found") {
        durableCache.entries[locationKey] = { checkedAt: new Date().toISOString(), reason, resolved };
      }
    }

    const { reason, resolved } = cachedResolution;

    if (!resolved) {
      unresolved.push({
        ...location,
        title: event.title,
        reason
      });
      continue;
    }

    updates.push({
      ...eventIdentity(event),
      city: location.city || resolved.city,
      country: location.country || resolved.country,
      region: location.region || resolved.region || "",
      coordinates: resolved.coordinates,
      coordinateLabel: resolved.label,
      coordinateSource: resolved.source,
      coordinateCountryCode: resolved.coordinateCountryCode || countryCodeFor(resolved.country || location.country)
    });
  }
  durableCache.schemaVersion = 2;
  durableCache.strategyVersion = GEOCODE_STRATEGY_VERSION;
  durableCache.updatedAt = new Date().toISOString();
  writeGeocodeCache(durableCache);

  const responses = [];
  if (updates.length) {
    for (let index = 0; index < updates.length; index += batchSize) {
      const items = updates.slice(index, index + batchSize);
      responses.push(await postCoordinateBatch({
        dryRun: !apply,
        items,
        runId: `coordinate-api-${Date.now()}-${Math.floor(index / batchSize) + 1}`
      }));
    }
  }

  const afterEvents = apply ? await fetchEvents({ activeFrom }) : events;
  const afterTargetEvents = eventId
    ? afterEvents.filter((event) => String(event._id || "") === eventId || String(event.slug || "") === eventId)
    : afterEvents;
  const remainingMissing = afterTargetEvents.filter((event) => !hasLocationCoordinates(event));

  console.log(
    JSON.stringify(
      {
        ok: unresolved.length === 0 && (!apply || remainingMissing.length === 0),
        mode: apply ? "apply" : "dry-run",
        geocoding: geocode ? "enabled" : "disabled",
        activeFrom,
        scanned: events.length,
        targeted: targetEvents.length,
        missingBefore: missingEvents.length,
        preparedUpdates: updates.length,
        postedBatches: responses.length,
        postedUpdated: responses.reduce((sum, response) => sum + (response.meta?.updated || 0), 0),
        geocodeCalls,
        missingAfter: remainingMissing.length,
        unresolved: unresolved.slice(0, 100),
        responseMeta: responses.map((response) => response.meta)
      },
      null,
      2
    )
  );

  if (failOnMissing && ((apply && remainingMissing.length > 0) || unresolved.length > 0)) {
    process.exitCode = 1;
  }
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  fetchEvents,
  geocodeLocation,
  geocoderSearchText,
  hasLocationCoordinates,
  locationFromEvent,
  cleanLocationPart
};
