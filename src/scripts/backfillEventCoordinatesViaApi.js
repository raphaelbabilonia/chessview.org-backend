const fs = require("node:fs");
const path = require("node:path");
const { cleanCountry, resolveCuratedLocation } = require("../data/locationCoordinates");

const localEnvPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(localEnvPath)) {
  require("dotenv").config({ path: localEnvPath, quiet: true });
}
require("dotenv").config({ quiet: true });

const DEFAULT_GEOCODER_USER_AGENT = "ChessViewCoordinateBackfill/0.1 (https://chessview.org)";

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
  const base = process.env.CHESSVIEW_API_BASE_URL;
  if (!base) throw new Error("Missing CHESSVIEW_API_BASE_URL");
  return base.replace(/\/+$/, "");
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

const coordinateIsValid = ([longitude, latitude] = []) =>
  Number.isFinite(Number(longitude)) &&
  Number.isFinite(Number(latitude)) &&
  longitude >= -180 &&
  longitude <= 180 &&
  latitude >= -90 &&
  latitude <= 90;

const hasLocationCoordinates = (event) => coordinateIsValid(event.location?.coordinates || []);

const locationFromEvent = (event) => ({
  city: String(event.city || event.location?.city || "").trim(),
  country: cleanCountry(event.country || event.location?.country || ""),
  region: String(event.region || event.location?.region || "").trim()
});

const geocodeLocation = async (location, { userAgent }) => {
  const query = [location.city, location.region, cleanCountry(location.country)].filter(Boolean).join(", ");
  if (!query) return null;

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("accept-language", "en");
  url.searchParams.set("q", query);

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": userAgent
    }
  });

  if (!response.ok) {
    throw new Error(`Nominatim returned ${response.status} for ${query}`);
  }

  const results = await response.json();
  const first = Array.isArray(results) ? results[0] : null;
  if (!first) return null;

  const coordinates = [Number(first.lon), Number(first.lat)];
  if (!coordinateIsValid(coordinates)) return null;

  return {
    city: location.city,
    country: cleanCountry(location.country),
    region: location.region || "",
    coordinates,
    label: first.display_name || query,
    source: "nominatim"
  };
};

const eventIdentity = (event) => ({
  eventId: event._id,
  slug: event.slug,
  dedupeKey: event.dedupeKey,
  originalId: event.source?.originalId || "",
  sourceUrl: event.source?.url || "",
  title: event.title
});

const fetchEvents = async ({ activeFrom }) => {
  const url = new URL(`${apiRoot()}/events`);
  url.searchParams.set("activeFrom", activeFrom);
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": DEFAULT_GEOCODER_USER_AGENT
    }
  });

  if (!response.ok) throw new Error(`Event list returned ${response.status}`);
  const payload = await response.json();
  return Array.isArray(payload.data) ? payload.data : [];
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
  const geocode = hasFlag("geocode") || String(process.env.GEOCODING_ENABLED || "").toLowerCase() === "true";
  const activeFrom = argValue("active-from", todayIsoDate());
  const maxGeocode = parsePositiveInt(argValue("max-geocode", process.env.GEOCODING_MAX_PER_RUN || "500"), 500);
  const delayMs = parsePositiveInt(argValue("delay-ms", process.env.GEOCODING_DELAY_MS || "1100"), 1100);
  const batchSize = parsePositiveInt(argValue("batch-size", "50"), 50);
  const userAgent = process.env.CHESSVIEW_GEOCODER_USER_AGENT || DEFAULT_GEOCODER_USER_AGENT;
  const events = await fetchEvents({ activeFrom });
  const missingEvents = events.filter((event) => !hasLocationCoordinates(event));
  const updates = [];
  const unresolved = [];
  let geocodeCalls = 0;

  for (const event of missingEvents) {
    const location = locationFromEvent(event);
    const curated = resolveCuratedLocation(location);
    let resolved = curated
      ? { ...curated, label: [curated.city, curated.region, curated.country].filter(Boolean).join(", "), source: "curated" }
      : null;

    if (!resolved && geocode && geocodeCalls < maxGeocode && location.city && location.country) {
      if (geocodeCalls > 0) await sleep(delayMs);
      geocodeCalls += 1;
      resolved = await geocodeLocation(location, { userAgent });
    }

    if (!resolved) {
      unresolved.push({
        ...location,
        title: event.title,
        reason: !geocode ? "geocoding-disabled" : geocodeCalls >= maxGeocode ? "geocode-limit-reached" : "not-found"
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
      coordinateSource: resolved.source
    });
  }

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
  const remainingMissing = afterEvents.filter((event) => !hasLocationCoordinates(event));

  console.log(
    JSON.stringify(
      {
        ok: unresolved.length === 0 && (!apply || remainingMissing.length === 0),
        mode: apply ? "apply" : "dry-run",
        geocoding: geocode ? "enabled" : "disabled",
        activeFrom,
        scanned: events.length,
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

  if ((apply && remainingMissing.length > 0) || unresolved.length > 0) {
    process.exitCode = 1;
  }
};

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
