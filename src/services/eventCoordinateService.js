const Event = require("../models/Event");
const { cleanCountry, locationFromEvent } = require("../data/locationCoordinates");
const { countryCodeFor } = require("../utils/geocodingSafety");

const coordinateIsValid = ([longitude, latitude] = []) =>
  Number.isFinite(Number(longitude)) &&
  Number.isFinite(Number(latitude)) &&
  longitude >= -180 &&
  longitude <= 180 &&
  latitude >= -90 &&
  latitude <= 90;

const queryForItem = (item = {}) => {
  const clauses = [];
  if (item.eventId) clauses.push({ _id: item.eventId });
  if (item._id) clauses.push({ _id: item._id });
  if (item.slug) clauses.push({ slug: item.slug });
  if (item.dedupeKey) clauses.push({ dedupeKey: item.dedupeKey });
  if (item.originalId) clauses.push({ "source.originalId": item.originalId });
  if (item.sourceUrl) clauses.push({ "source.url": item.sourceUrl });
  return clauses.length ? { $or: clauses } : null;
};

const cleanCoordinates = (value) => {
  if (!Array.isArray(value)) return null;
  const coordinates = value.map(Number);
  return coordinateIsValid(coordinates) ? coordinates : null;
};

const coordinateCountryMatches = (event, item) => {
  const suppliedCode = String(item.coordinateCountryCode || "").trim().toLowerCase();
  if (!suppliedCode) return true;

  const country = cleanCountry(item.country || locationFromEvent(event).country);
  const expectedCode = countryCodeFor(country);
  return !expectedCode || suppliedCode === expectedCode;
};

const coordinatePatch = (event, item) => {
  const coordinates = cleanCoordinates(item.coordinates);
  if (!coordinates) return null;

  const [longitude, latitude] = coordinates;
  const currentLocation = event.location?.toObject ? event.location.toObject() : event.location || {};
  const eventLocation = locationFromEvent(event);
  const city = item.city || eventLocation.city || currentLocation.city || "";
  const country = cleanCountry(item.country || eventLocation.country || currentLocation.country || "");
  const region = item.region || eventLocation.region || currentLocation.region || "";
  const coordinateSource = item.coordinateSource || item.source || "agent-coordinate-backfill";

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
      coordinates,
      coordinateStatus: "resolved",
      coordinateSource,
      coordinateLabel: item.coordinateLabel || item.label || [city, region, country].filter(Boolean).join(", "),
      geocodedAt: item.geocodedAt ? new Date(item.geocodedAt) : new Date()
    }
  };
};

const applyCoordinatePatch = async (event, item) => {
  const patch = coordinatePatch(event, item);
  if (!patch) return { ok: false, reason: "invalid-coordinates" };

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

  return { ok: true, patch };
};

const applyEventCoordinateUpdates = async ({ items, dryRun = false }) => {
  const result = { updated: [], skipped: [], rejected: [], errors: [] };

  for (const item of Array.isArray(items) ? items : []) {
    try {
      const query = queryForItem(item);
      const coordinates = cleanCoordinates(item.coordinates);

      if (!query) {
        result.rejected.push({ title: item.title || "", reason: "missing-event-identity" });
        continue;
      }
      if (!coordinates) {
        result.rejected.push({ title: item.title || "", reason: "invalid-coordinates" });
        continue;
      }

      const event = await Event.findOne(query);
      if (!event) {
        result.skipped.push({ title: item.title || "", reason: "event-not-found" });
        continue;
      }
      if (!coordinateCountryMatches(event, item)) {
        result.rejected.push({ title: item.title || event.title, reason: "coordinate-country-mismatch" });
        continue;
      }

      if (dryRun) {
        result.updated.push({ id: String(event._id), title: event.title, action: "would_update" });
        continue;
      }

      const patchResult = await applyCoordinatePatch(event, { ...item, coordinates });
      if (!patchResult.ok) {
        result.rejected.push({ title: item.title || event.title, reason: patchResult.reason });
        continue;
      }

      result.updated.push({
        id: String(event._id),
        title: event.title,
        coordinates: patchResult.patch.location.coordinates,
        source: patchResult.patch.location.coordinateSource
      });
    } catch (error) {
      result.errors.push({ title: item.title || "", message: error.message });
    }
  }

  return result;
};

module.exports = {
  applyEventCoordinateUpdates
};
