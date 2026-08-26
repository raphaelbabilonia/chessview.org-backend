const mongoose = require("mongoose");
const Event = require("../models/Event");
const Section = require("../models/Section");
const Player = require("../models/Player");
const Round = require("../models/Round");
const Pairing = require("../models/Pairing");
const Registration = require("../models/Registration");
const EventDocument = require("../models/EventDocument");
const calculateStandings = require("../utils/calculateStandings");
const { canManageEvent, canViewEvent, publicEventStatuses } = require("../utils/permissions");
const {
  eventListItem,
  isIndexableEvent,
  publicDocument,
  publicEventDetail,
  publicPairing,
  publicPlayer,
  publicRound,
  publicSection
} = require("../utils/publicSerializers");
const slugify = require("../utils/slugify");
const { excludeSyntheticTestEventsQuery, isSyntheticTestEvent } = require("../utils/syntheticTestEvents");

const MAX_PUBLIC_LIMIT = 100;
const MAX_TEXT_FILTER_LENGTH = 120;
const MAX_FACET_VALUES = 100;
const PUBLIC_SORTS = new Set(["soonest", "relevance", "updated"]);

const startOfTodayUtc = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

const booleanQuery = (value) => String(value || "").toLowerCase() === "true";

const firstQueryValue = (value) => (Array.isArray(value) ? value[0] : value);

const queryText = (value) =>
  String(firstQueryValue(value) || "")
    .trim()
    .slice(0, MAX_TEXT_FILTER_LENGTH);

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const literalRegex = (value) => new RegExp(escapeRegex(value), "i");

const queryDate = (value) => {
  const raw = firstQueryValue(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
};

const parsePositiveInt = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(Math.trunc(parsed), 1);
};

const paginationFromQuery = (query) => {
  const limit = Math.min(parsePositiveInt(query.limit, 50), MAX_PUBLIC_LIMIT);
  const page = parsePositiveInt(query.page, 1);
  return {
    enabled: true,
    limit,
    page,
    skip: (page - 1) * limit
  };
};

const paginationMeta = (total, pagination) => ({
  count: pagination.enabled ? Math.min(Math.max(total - pagination.skip, 0), pagination.limit) : total,
  total,
  limit: pagination.enabled ? pagination.limit : total,
  page: pagination.enabled ? pagination.page : 1,
  pages: pagination.enabled ? Math.max(Math.ceil(total / pagination.limit), 1) : 1,
  hasNext: pagination.enabled ? pagination.skip + pagination.limit < total : false,
  hasPrev: pagination.enabled ? pagination.page > 1 : false
});

const applyPagination = (items, pagination) =>
  pagination.enabled ? items.slice(pagination.skip, pagination.skip + pagination.limit) : items;

const requestedSort = (value) => {
  const sort = queryText(value).toLowerCase();
  return PUBLIC_SORTS.has(sort) ? sort : "soonest";
};

const timeControlFor = (event) => {
  const format = event.metadata?.format || {};
  return String(event.timeControl || format.timeControlCategory || format.timeControl || format.speedLabel || "").trim();
};

const addLiteralOrFilter = (filter, fields, value) => {
  if (!value) return;
  filter.$and ||= [];
  const expression = literalRegex(value);
  filter.$and.push({ $or: fields.map((field) => ({ [field]: expression })) });
};

const applyPublicEventFilters = (filter, query, { defaultUpcoming = true } = {}) => {
  const search = queryText(query.search);
  const city = queryText(query.city);
  const country = queryText(query.country);
  const source = queryText(query.source);
  const status = queryText(query.status);
  const timeControl = queryText(query.timeControl);
  const activeFrom = queryDate(query.activeFrom);
  const from = queryDate(query.from);
  const to = queryDate(query.to);
  const explicitDateWindow = activeFrom || from || to;

  addLiteralOrFilter(filter, ["title", "city", "country", "source.name"], search);
  if (city) filter.city = literalRegex(city);
  if (country) filter.country = literalRegex(country);
  if (source) filter["source.name"] = literalRegex(source);
  addLiteralOrFilter(
    filter,
    ["timeControl", "metadata.format.timeControl", "metadata.format.timeControlCategory", "metadata.format.speedLabel"],
    timeControl
  );
  if (status) filter.status = publicEventStatuses.includes(status) ? status : "__not_public__";
  if (activeFrom) filter.endDate = { $gte: activeFrom };
  if (defaultUpcoming && !booleanQuery(query.includePast) && !explicitDateWindow) {
    filter.endDate = { $gte: startOfTodayUtc() };
  }
  if (from || to) {
    filter.startDate = {};
    if (from) filter.startDate.$gte = from;
    if (to) filter.startDate.$lte = to;
  }

  return { search };
};

const relevanceRank = (event, search) => {
  const term = String(search || "").toLowerCase();
  if (!term) return 0;
  const title = String(event.title || "").toLowerCase();
  if (title === term) return 0;
  if (title.startsWith(term)) return 1;
  if (title.includes(term)) return 2;
  if (String(event.city || "").toLowerCase().includes(term)) return 3;
  if (String(event.country || "").toLowerCase().includes(term)) return 4;
  if (String(event.source?.name || "").toLowerCase().includes(term)) return 5;
  return 6;
};

const compareRelevantEvents = (search) => (left, right) => {
  const rankDifference = relevanceRank(left, search) - relevanceRank(right, search);
  if (rankDifference) return rankDifference;
  return new Date(left.startDate).getTime() - new Date(right.startDate).getTime();
};

const facetValues = (values) => {
  const counts = new Map();
  for (const raw of values) {
    const value = String(raw || "").trim();
    if (!value) continue;
    const key = value.toLocaleLowerCase("en");
    const current = counts.get(key) || { value, count: 0 };
    current.count += 1;
    counts.set(key, current);
  }
  return [...counts.values()]
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value))
    .slice(0, MAX_FACET_VALUES);
};

const sendEventList = (res, data, total, pagination) => {
  const payload = { success: true, data };
  payload.meta = paginationMeta(total, pagination);
  return res.json(payload);
};

const eventCountMap = async (Model, eventIds) => {
  if (!eventIds.length) return new Map();
  const counts = await Model.aggregate([
    { $match: { event: { $in: eventIds } } },
    { $group: { _id: "$event", count: { $sum: 1 } } }
  ]);
  return new Map(counts.map((item) => [String(item._id), item.count]));
};

const makeSlug = async (title) => {
  const base = slugify(title);
  let slug = base;
  let suffix = 2;
  while (await Event.findOne({ slug })) {
    slug = `${base}-${suffix++}`;
  }
  return slug;
};

const filterEvents = (events, query) => {
  const search = String(query.search || "").toLowerCase();
  const city = String(query.city || "").toLowerCase();
  const country = String(query.country || "").toLowerCase();
  const source = String(query.source || "").toLowerCase();
  const status = String(query.status || "");
  const from = query.from ? new Date(query.from) : null;
  const to = query.to ? new Date(query.to) : null;
  const activeFrom = query.activeFrom ? new Date(query.activeFrom) : null;

  return events.filter((event) => {
    if (search && !event.title.toLowerCase().includes(search)) return false;
    if (city && !event.city.toLowerCase().includes(city)) return false;
    if (country && !String(event.country || "").toLowerCase().includes(country)) return false;
    if (source && !String(event.source?.name || "").toLowerCase().includes(source)) return false;
    if (status && event.status !== status) return false;
    if (activeFrom && new Date(event.endDate || event.startDate) < activeFrom) return false;
    if (from && new Date(event.startDate) < from) return false;
    if (to && new Date(event.startDate) > to) return false;
    return true;
  });
};

const listEvents = async (req, res) => {
  const pagination = paginationFromQuery(req.query);
  const mine = req.query.mine === "true";
  const sort = requestedSort(req.query.sort);
  const filter =
    mine
      ? req.user?.role === "admin"
        ? {}
        : { organizer: req.user?._id }
      : { isPublic: true, status: { $in: publicEventStatuses } };

  if (!mine) {
    Object.assign(filter, excludeSyntheticTestEventsQuery());
  }

  const { search } = applyPublicEventFilters(filter, req.query, { defaultUpcoming: !mine });
  if (mine) {
    const status = queryText(req.query.status);
    if (status) filter.status = status;
  }

  let query = Event.find(filter)
    .select([
      "_id",
      "title",
      "slug",
      "description",
      "city",
      "venueName",
      "address",
      "startDate",
      "endDate",
      "status",
      "registrationStatus",
      "timeControl",
      "country",
      "region",
      "location.coordinates",
      "location.longitude",
      "location.latitude",
      "location.lng",
      "location.lat",
      "location.province",
      "sourceOrganizerName",
      "websiteUrl",
      "resultsUrl",
      "regulationsUrl",
      "source",
      "externalLinks",
      "dataQualityScore",
      "metadata",
      "createdAt",
      "updatedAt"
    ].join(" "));
  if (sort === "updated") query = query.sort({ updatedAt: -1, startDate: 1 });
  else query = query.sort({ startDate: 1 });
  const inMemoryRelevance = sort === "relevance" && Boolean(search);
  if (pagination.enabled && !inMemoryRelevance) {
    query = query.skip(pagination.skip).limit(pagination.limit);
  }

  let [events, total] = await Promise.all([
    query.lean(),
    Event.countDocuments(filter)
  ]);
  if (inMemoryRelevance) {
    events.sort(compareRelevantEvents(search));
    events = applyPagination(events, pagination);
  }
  const eventIds = events.map((event) => event._id);
  const [sectionsByEvent, playersByEvent, roundsByEvent] = await Promise.all([
    eventCountMap(Section, eventIds),
    eventCountMap(Player, eventIds),
    eventCountMap(Round, eventIds)
  ]);
  const data = events.map((event) => {
    const eventId = String(event._id);
    return {
      ...eventListItem(event),
      sectionsCount: sectionsByEvent.get(eventId) || 0,
      playersCount: playersByEvent.get(eventId) || 0,
      roundsCount: roundsByEvent.get(eventId) || 0
    };
  });
  return sendEventList(res, data, total, pagination);
};

const listEventFacets = async (req, res) => {
  const filter = {
    isPublic: true,
    status: { $in: publicEventStatuses },
    ...excludeSyntheticTestEventsQuery()
  };
  applyPublicEventFilters(filter, req.query);
  const events = await Event.find(filter)
    .select("city country timeControl metadata.format.timeControl metadata.format.timeControlCategory metadata.format.speedLabel")
    .lean();

  res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=900");
  return res.json({
    success: true,
    data: {
      countries: facetValues(events.map((event) => event.country)),
      cities: facetValues(events.map((event) => event.city)),
      timeControls: facetValues(events.map(timeControlFor))
    },
    meta: { eventsMatched: events.length, valuesLimit: MAX_FACET_VALUES }
  });
};

const listEventCatalog = async (req, res) => {
  const filter = {
    isPublic: true,
    status: { $in: publicEventStatuses },
    ...excludeSyntheticTestEventsQuery()
  };
  if (!booleanQuery(req.query.includePast)) {
    filter.endDate = { $gte: startOfTodayUtc() };
  }

  const events = await Event.find(filter)
    .select([
      "_id",
      "title",
      "slug",
      "city",
      "country",
      "region",
      "location",
      "coordinates",
      "longitude",
      "latitude",
      "lng",
      "lat",
      "startDate",
      "endDate",
      "status",
      "timeControl",
      "websiteUrl",
      "resultsUrl",
      "regulationsUrl",
      "externalLinks",
      "dataQualityScore",
      "source.name",
      "source.url",
      "metadata.logistics.coordinates",
      "metadata.logistics.longitude",
      "metadata.logistics.latitude",
      "metadata.logistics.lng",
      "metadata.logistics.lat",
      "metadata.logistics.country",
      "metadata.logistics.city",
      "metadata.logistics.province",
      "metadata.logistics.region",
      "metadata.format.timeControl",
      "metadata.format.timeControlCategory",
      "metadata.format.speedLabel",
      "updatedAt"
    ].join(" "))
    .sort({ startDate: 1 })
    .lean();

  let compactEvents = events.map((event) => {
    const location = event.location || {};
    const logistics = event.metadata?.logistics || {};
    const format = event.metadata?.format || {};
    const coordinateCandidates = [
      location.coordinates,
      logistics.coordinates,
      [location.longitude ?? location.lng, location.latitude ?? location.lat],
      [logistics.longitude ?? logistics.lng, logistics.latitude ?? logistics.lat]
    ];
    const coordinates = coordinateCandidates.find(
      (candidate) =>
        Array.isArray(candidate) &&
        candidate.length >= 2 &&
        candidate.slice(0, 2).every((value) => Number.isFinite(Number(value)))
    );

    return {
      _id: event._id,
      title: event.title,
      slug: event.slug,
      city: event.city || location.city || logistics.city || "",
      country: event.country || location.country || logistics.country || "",
      region: event.region || location.region || location.province || logistics.region || logistics.province || "",
      ...(coordinates ? { coordinates: coordinates.slice(0, 2).map(Number) } : {}),
      startDate: event.startDate,
      endDate: event.endDate,
      status: event.status,
      timeControl: event.timeControl || format.timeControlCategory || format.timeControl || format.speedLabel || "",
      source: { name: event.source?.name || "" },
      indexable: isIndexableEvent(event),
      updatedAt: event.updatedAt
    };
  });
  if (booleanQuery(req.query.indexableOnly)) {
    compactEvents = compactEvents.filter((event) => event.indexable);
  }

  res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  return res.json({
    success: true,
    data: compactEvents,
    meta: { count: compactEvents.length }
  });
};

const getEvent = async (req, res) => {
  const query = mongoose.Types.ObjectId.isValid(req.params.id)
    ? { _id: req.params.id }
    : { slug: req.params.id };
  const event = await Event.findOne(query).populate("organizer", "name email role").lean();
  if (!event) return res.status(404).json({ success: false, message: "Event not found" });
  if (isSyntheticTestEvent(event) && !canManageEvent(req.user, event)) {
    return res.status(404).json({ success: false, message: "Event not found" });
  }
  if (!canViewEvent(req.user, event)) {
    return res.status(403).json({ success: false, message: "This event is not public" });
  }
  const manageable = canManageEvent(req.user, event);

  const [sections, players, rounds, pairings, registrations, documents] = await Promise.all([
    Section.find({ event: event._id }).sort({ _id: 1 }).lean(),
    Player.find({ event: event._id }).sort({ _id: 1 }).lean(),
    Round.find({ event: event._id }).sort({ number: 1 }).lean(),
    Pairing.find({ event: event._id }).sort({ _id: 1 }).lean(),
    Registration.find({ event: event._id }).sort({ _id: 1 }).lean(),
    EventDocument.find({ event: event._id }).sort({ type: 1, label: 1 }).lean()
  ]);
  const safePlayers = manageable ? players : players.map(publicPlayer);
  const standings = calculateStandings(safePlayers, pairings);

  if (!manageable) {
    return res.json({
      success: true,
      data: {
        ...publicEventDetail(event),
        sections: sections.map(publicSection),
        players: safePlayers,
        rounds: rounds.map(publicRound),
        pairings: pairings.map(publicPairing),
        registrations: [],
        documents: documents.filter((document) => document.status !== "failed").map(publicDocument),
        standings
      }
    });
  }

  res.json({
    success: true,
    data: {
      ...event,
      organizer: event.organizer,
      sections,
      players: safePlayers,
      rounds,
      pairings,
      registrations,
      documents,
      standings
    }
  });
};

const createEvent = async (req, res) => {
  const event = await Event.create({
    ...req.body,
    organizer: req.user._id,
    slug: await makeSlug(req.body.title)
  });
  res.status(201).json({ success: true, data: event });
};

const updateEvent = async (req, res) => {
  const event = await Event.findById(req.params.id);
  if (!event) return res.status(404).json({ success: false, message: "Event not found" });
  if (!canManageEvent(req.user, event)) {
    return res.status(403).json({ success: false, message: "You can only edit your own events" });
  }
  Object.assign(event, req.body);
  await event.save();
  res.json({ success: true, data: event });
};

const deleteEvent = async (req, res) => {
  const event = await Event.findById(req.params.id);
  if (!event) return res.status(404).json({ success: false, message: "Event not found" });
  if (!canManageEvent(req.user, event)) {
    return res.status(403).json({ success: false, message: "You can only delete your own events" });
  }
  await Promise.all([
    Section.deleteMany({ event: event._id }),
    Registration.deleteMany({ event: event._id }),
    Player.deleteMany({ event: event._id }),
    Round.deleteMany({ event: event._id }),
    Pairing.deleteMany({ event: event._id }),
    EventDocument.deleteMany({ event: event._id }),
    event.deleteOne()
  ]);
  res.json({ success: true, data: { id: req.params.id } });
};

module.exports = {
  listEvents,
  listEventFacets,
  listEventCatalog,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent
};
