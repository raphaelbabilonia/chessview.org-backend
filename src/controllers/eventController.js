const mongoose = require("mongoose");
const Event = require("../models/Event");
const Section = require("../models/Section");
const Player = require("../models/Player");
const Round = require("../models/Round");
const Pairing = require("../models/Pairing");
const Registration = require("../models/Registration");
const calculateStandings = require("../utils/calculateStandings");
const { canManageEvent } = require("../utils/permissions");
const slugify = require("../utils/slugify");

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

const listEvents = async (req, res) => {
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
};

const getEvent = async (req, res) => {
  const query = mongoose.Types.ObjectId.isValid(req.params.id)
    ? { _id: req.params.id }
    : { slug: req.params.id };
  const event = await Event.findOne(query).populate("organizer", "name email role").lean();
  if (!event) return res.status(404).json({ success: false, message: "Event not found" });
  if (!event.isPublic && !canManageEvent(req.user, event)) {
    return res.status(403).json({ success: false, message: "This event is not public" });
  }

  const [sections, players, rounds, pairings, registrations] = await Promise.all([
    Section.find({ event: event._id }).sort({ _id: 1 }).lean(),
    Player.find({ event: event._id }).sort({ _id: 1 }).lean(),
    Round.find({ event: event._id }).sort({ number: 1 }).lean(),
    Pairing.find({ event: event._id }).sort({ _id: 1 }).lean(),
    Registration.find({ event: event._id }).sort({ _id: 1 }).lean()
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
    event.deleteOne()
  ]);
  res.json({ success: true, data: { id: req.params.id } });
};

module.exports = {
  listEvents,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent
};
