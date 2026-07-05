const fs = require("node:fs");
const path = require("node:path");
const mongoose = require("mongoose");
const { connectDB } = require("../config/db");
const Event = require("../models/Event");
const {
  cleanCountry,
  coordinatesFromEvent,
  locationFromEvent,
  normalizeText,
  resolveCuratedLocation
} = require("../data/locationCoordinates");

const localEnvPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(localEnvPath)) {
  require("dotenv").config({ path: localEnvPath, quiet: true });
}
require("dotenv").config({ quiet: true });

const PUBLIC_STATUSES = ["published", "completed"];
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

const startOfTodayUtc = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

const sleep = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

const locationKey = (location) =>
  [location.city, cleanCountry(location.country), location.region].map(normalizeText).join("|");

const coordinateIsValid = ([longitude, latitude] = []) =>
  Number.isFinite(Number(longitude)) &&
  Number.isFinite(Number(latitude)) &&
  longitude >= -180 &&
  longitude <= 180 &&
  latitude >= -90 &&
  latitude <= 90;

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

const buildLocationPatch = (event, resolved, now) => {
  const [longitude, latitude] = resolved.coordinates;
  const currentLocation = event.location?.toObject ? event.location.toObject() : event.location || {};
  const eventLocation = locationFromEvent(event);
  const city = eventLocation.city || resolved.city || currentLocation.city || "";
  const country = cleanCountry(eventLocation.country || resolved.country || currentLocation.country || "");
  const region = eventLocation.region || resolved.region || currentLocation.region || "";
  const coordinateSource = resolved.source || "curated";

  return {
    country,
    region,
    location: {
      ...currentLocation,
      city,
      country,
      region,
      latitude,
      longitude,
      coordinates: [longitude, latitude],
      coordinateStatus: "resolved",
      coordinateSource,
      coordinateLabel: resolved.label || [city, region, country].filter(Boolean).join(", "),
      geocodedAt: now
    }
  };
};

const applyCoordinatePatch = async (event, resolved, now) => {
  const patch = buildLocationPatch(event, resolved, now);
  event.country = event.country || patch.country;
  event.region = event.region || patch.region;
  event.location = patch.location;

  const metadata = event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata)
    ? event.metadata
    : {};
  const logistics = metadata.logistics && typeof metadata.logistics === "object" && !Array.isArray(metadata.logistics)
    ? metadata.logistics
    : {};
  metadata.logistics = {
    ...logistics,
    city: logistics.city || patch.location.city,
    country: logistics.country || patch.location.country,
    latitude: patch.location.latitude,
    longitude: patch.location.longitude,
    coordinates: patch.location.coordinates,
    coordinateSource: patch.location.coordinateSource,
    region: logistics.region || patch.location.region
  };

  event.metadata = metadata;
  event.markModified("location");
  event.markModified("metadata");
  await event.save();
};

const main = async () => {
  await connectDB();

  const apply = hasFlag("apply");
  const geocode = hasFlag("geocode") || String(process.env.GEOCODING_ENABLED || "").toLowerCase() === "true";
  const includePast = hasFlag("include-past");
  const maxGeocode = parsePositiveInt(argValue("max-geocode", process.env.GEOCODING_MAX_PER_RUN || "500"), 500);
  const delayMs = parsePositiveInt(argValue("delay-ms", process.env.GEOCODING_DELAY_MS || "1100"), 1100);
  const userAgent = process.env.CHESSVIEW_GEOCODER_USER_AGENT || DEFAULT_GEOCODER_USER_AGENT;
  const countryFilter = cleanCountry(argValue("country", ""));
  const filter = {
    isPublic: true,
    status: { $in: PUBLIC_STATUSES }
  };

  if (!includePast) filter.endDate = { $gte: startOfTodayUtc() };
  if (countryFilter) filter.country = new RegExp(`^${countryFilter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");

  const events = await Event.find(filter).sort({ country: 1, city: 1, startDate: 1, title: 1 });
  const missingEvents = events.filter((event) => !coordinatesFromEvent(event));
  const missingByLocation = new Map();

  for (const event of missingEvents) {
    const location = locationFromEvent(event);
    const key = locationKey(location);
    if (!missingByLocation.has(key)) {
      missingByLocation.set(key, {
        location,
        events: []
      });
    }
    missingByLocation.get(key).events.push(event);
  }

  const resolvedByKey = new Map();
  const unresolved = [];
  const errors = [];
  let geocodeCalls = 0;

  for (const [key, bucket] of missingByLocation) {
    const curated = resolveCuratedLocation(bucket.location);
    if (curated) {
      resolvedByKey.set(key, { ...curated, label: [curated.city, curated.region, curated.country].filter(Boolean).join(", "), source: "curated" });
      continue;
    }

    if (!geocode || geocodeCalls >= maxGeocode || !bucket.location.city || !bucket.location.country) {
      unresolved.push({
        ...bucket.location,
        count: bucket.events.length,
        reason: !geocode ? "geocoding-disabled" : geocodeCalls >= maxGeocode ? "geocode-limit-reached" : "missing-city-or-country"
      });
      continue;
    }

    try {
      if (geocodeCalls > 0) await sleep(delayMs);
      geocodeCalls += 1;
      const geocoded = await geocodeLocation(bucket.location, { userAgent });
      if (geocoded) {
        resolvedByKey.set(key, geocoded);
      } else {
        unresolved.push({ ...bucket.location, count: bucket.events.length, reason: "not-found" });
      }
    } catch (error) {
      errors.push({ ...bucket.location, count: bucket.events.length, message: error.message });
    }
  }

  let appliedEvents = 0;
  const updates = [];
  const now = new Date();

  for (const [key, resolved] of resolvedByKey) {
    const bucket = missingByLocation.get(key);
    if (!bucket) continue;

    updates.push({
      location: bucket.location,
      resolved: {
        city: resolved.city,
        country: resolved.country,
        region: resolved.region,
        coordinates: resolved.coordinates,
        source: resolved.source
      },
      events: bucket.events.map((event) => ({
        id: String(event._id),
        title: event.title,
        startDate: event.startDate
      }))
    });

    if (apply) {
      for (const event of bucket.events) {
        await applyCoordinatePatch(event, resolved, now);
        appliedEvents += 1;
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: errors.length === 0,
        mode: apply ? "apply" : "dry-run",
        geocoding: geocode ? "enabled" : "disabled",
        scanned: events.length,
        missingEvents: missingEvents.length,
        uniqueMissingLocations: missingByLocation.size,
        resolvedLocations: resolvedByKey.size,
        appliedEvents,
        geocodeCalls,
        updates: updates.slice(0, 100),
        unresolved: unresolved.slice(0, 100),
        errors
      },
      null,
      2
    )
  );
};

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });
