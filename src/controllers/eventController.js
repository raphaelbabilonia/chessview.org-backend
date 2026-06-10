const mongoose = require("mongoose");
const Event = require("../models/Event");
const Section = require("../models/Section");
const Player = require("../models/Player");
const Round = require("../models/Round");
const Pairing = require("../models/Pairing");
const Registration = require("../models/Registration");
const asyncHandler = require("../utils/asyncHandler");
const calculateStandings = require("../utils/calculateStandings");
const { canManageEvent } = require("../utils/permissions");
const { usingMemoryStore } = require("../config/db");
const {
  byEventOrSlug,
  clone,
  createEvent: createMemoryEvent,
  getEventBundle,
  slugify,
  store,
  summarizeEvent,
  updateRecord
} = require("../utils/memoryStore");

const publicStatuses = ["published", "completed"];

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
  const status = String(query.status || "");
  const from = query.from ? new Date(query.from) : null;
  const to = query.to ? new Date(query.to) : null;

  return events.filter((event) => {
    if (search && !event.title.toLowerCase().includes(search)) return false;
    if (city && !event.city.toLowerCase().includes(city)) return false;
    if (status && event.status !== status) return false;
    if (from && new Date(event.startDate) < from) return false;
    if (to && new Date(event.startDate) > to) return false;
    return true;
  });
};

const listEvents = asyncHandler(async (req, res) => {
  if (usingMemoryStore()) {
    let events = store.events;
    if (req.query.mine === "true") {
      if (!req.user) return res.status(401).json({ success: false, message: "Authentication required" });
      events =
        req.user.role === "admin"
          ? events
          : events.filter((event) => String(event.organizer) === String(req.user._id));
    } else {
      events = events.filter((event) => event.isPublic && publicStatuses.includes(event.status));
    }

    const data = filterEvents(events, req.query)
      .sort((a, b) => new Date(a.startDate) - new Date(b.startDate))
      .map(summarizeEvent);
    return res.json({ success: true, data });
  }

  const filter =
    req.query.mine === "true"
      ? req.user?.role === "admin"
        ? {}
        : { organizer: req.user?._id }
      : { isPublic: true, status: { $in: publicStatuses } };

  if (req.query.search) filter.title = { $regex: req.query.search, $options: "i" };
  if (req.query.city) filter.city = { $regex: req.query.city, $options: "i" };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.from || req.query.to) {
    filter.startDate = {};
    if (req.query.from) filter.startDate.$gte = new Date(req.query.from);
    if (req.query.to) filter.startDate.$lte = new Date(req.query.to);
  }

  const events = await Event.find(filter).sort({ startDate: 1 }).lean();
  const data = await Promise.all(
    events.map(async (event) => ({
      ...event,
      sectionsCount: await Section.countDocuments({ event: event._id }),
      playersCount: await Player.countDocuments({ event: event._id }),
      roundsCount: await Round.countDocuments({ event: event._id })
    }))
  );
  res.json({ success: true, data });
});

const getEvent = asyncHandler(async (req, res) => {
  if (usingMemoryStore()) {
    const event = byEventOrSlug(req.params.id);
    if (!event) return res.status(404).json({ success: false, message: "Event not found" });
    if (!event.isPublic && !canManageEvent(req.user, event)) {
      return res.status(403).json({ success: false, message: "This event is not public" });
    }
    return res.json({ success: true, data: getEventBundle(event) });
  }

  const query = mongoose.Types.ObjectId.isValid(req.params.id)
    ? { _id: req.params.id }
    : { slug: req.params.id };
  const event = await Event.findOne(query).populate("organizer", "name email role").lean();
  if (!event) return res.status(404).json({ success: false, message: "Event not found" });
  if (!event.isPublic && !canManageEvent(req.user, event)) {
    return res.status(403).json({ success: false, message: "This event is not public" });
  }

  const [sections, players, rounds, pairings, registrations] = await Promise.all([
    Section.find({ event: event._id }).lean(),
    Player.find({ event: event._id }).lean(),
    Round.find({ event: event._id }).sort({ number: 1 }).lean(),
    Pairing.find({ event: event._id }).lean(),
    Registration.find({ event: event._id }).lean()
  ]);

  res.json({
    success: true,
    data: {
      ...event,
      sections,
      players,
      rounds,
      pairings,
      registrations,
      standings: calculateStandings(players, pairings)
    }
  });
});

const createEvent = asyncHandler(async (req, res) => {
  const { title, city, startDate, endDate } = req.body;
  if (!title || !city || !startDate || !endDate) {
    return res.status(400).json({ success: false, message: "Title, city, start date, and end date are required" });
  }

  if (usingMemoryStore()) {
    const event = createMemoryEvent(req.user, req.body);
    return res.status(201).json({ success: true, data: clone(event) });
  }

  const event = await Event.create({
    ...req.body,
    organizer: req.user._id,
    slug: await makeSlug(title),
    isPublic: Boolean(req.body.isPublic)
  });
  res.status(201).json({ success: true, data: event });
});

const updateEvent = asyncHandler(async (req, res) => {
  if (usingMemoryStore()) {
    const event = byEventOrSlug(req.params.id);
    if (!event) return res.status(404).json({ success: false, message: "Event not found" });
    if (!canManageEvent(req.user, event)) {
      return res.status(403).json({ success: false, message: "You can only edit your own events" });
    }
    const updated = updateRecord(event, req.body);
    return res.json({ success: true, data: clone(updated) });
  }

  const event = await Event.findById(req.params.id);
  if (!event) return res.status(404).json({ success: false, message: "Event not found" });
  if (!canManageEvent(req.user, event)) {
    return res.status(403).json({ success: false, message: "You can only edit your own events" });
  }
  Object.assign(event, req.body);
  await event.save();
  res.json({ success: true, data: event });
});

const deleteEvent = asyncHandler(async (req, res) => {
  if (usingMemoryStore()) {
    const event = byEventOrSlug(req.params.id);
    if (!event) return res.status(404).json({ success: false, message: "Event not found" });
    if (!canManageEvent(req.user, event)) {
      return res.status(403).json({ success: false, message: "You can only delete your own events" });
    }
    const eventId = event._id;
    store.events = store.events.filter((item) => item._id !== eventId);
    store.sections = store.sections.filter((item) => item.event !== eventId);
    store.registrations = store.registrations.filter((item) => item.event !== eventId);
    store.players = store.players.filter((item) => item.event !== eventId);
    store.rounds = store.rounds.filter((item) => item.event !== eventId);
    store.pairings = store.pairings.filter((item) => item.event !== eventId);
    return res.json({ success: true, data: { id: eventId } });
  }

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
    event.deleteOne()
  ]);
  res.json({ success: true, data: { id: req.params.id } });
});

module.exports = {
  listEvents,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent
};
