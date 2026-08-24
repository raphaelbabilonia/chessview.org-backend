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
const { eventListItem, publicOrganizer, publicPlayer } = require("../utils/publicSerializers");
const slugify = require("../utils/slugify");
const { excludeSyntheticTestEventsQuery, isSyntheticTestEvent } = require("../utils/syntheticTestEvents");

const MAX_PUBLIC_LIMIT = 100;
const MAX_TEXT_FILTER_LENGTH = 120;

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
  const search = queryText(req.query.search);
  const city = queryText(req.query.city);
  const country = queryText(req.query.country);
  const source = queryText(req.query.source);
  const status = queryText(req.query.status);
  const activeFrom = queryDate(req.query.activeFrom);
  const from = queryDate(req.query.from);
  const to = queryDate(req.query.to);
  const explicitDateWindow = activeFrom || from || to;
  const filter =
    mine
      ? req.user?.role === "admin"
        ? {}
        : { organizer: req.user?._id }
      : { isPublic: true, status: { $in: publicEventStatuses } };

  if (!mine) {
    Object.assign(filter, excludeSyntheticTestEventsQuery());
  }

  if (search) filter.title = literalRegex(search);
  if (city) filter.city = literalRegex(city);
  if (country) filter.country = literalRegex(country);
  if (source) filter["source.name"] = literalRegex(source);
  if (status) {
    filter.status = mine || publicEventStatuses.includes(status) ? status : "__not_public__";
  }
  if (activeFrom) {
    filter.endDate = { $gte: activeFrom };
  }
  if (!mine && !booleanQuery(req.query.includePast) && !explicitDateWindow) {
    filter.endDate = { $gte: startOfTodayUtc() };
  }
  if (from || to) {
    filter.startDate = {};
    if (from) filter.startDate.$gte = from;
    if (to) filter.startDate.$lte = to;
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
    ].join(" "))
    .sort({ startDate: 1 });
  if (pagination.enabled) {
    query = query.skip(pagination.skip).limit(pagination.limit);
  }

  const [events, total] = await Promise.all([
    query.lean(),
    Event.countDocuments(filter)
  ]);
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
      "source.name",
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

  const compactEvents = events.map((event) => {
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
      updatedAt: event.updatedAt
    };
  });

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

  res.json({
    success: true,
    data: {
      ...event,
      organizer: manageable ? event.organizer : publicOrganizer(event.organizer),
      sections,
      players: safePlayers,
      rounds,
      pairings,
      registrations: manageable ? registrations : [],
      documents,
      standings: calculateStandings(safePlayers, pairings)
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
  listEventCatalog,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent
};
