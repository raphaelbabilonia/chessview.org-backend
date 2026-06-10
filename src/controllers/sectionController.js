const Event = require("../models/Event");
const Section = require("../models/Section");
const Player = require("../models/Player");
const Round = require("../models/Round");
const Pairing = require("../models/Pairing");
const asyncHandler = require("../utils/asyncHandler");
const { canManageEvent } = require("../utils/permissions");
const { usingMemoryStore } = require("../config/db");
const {
  byEventOrSlug,
  byId,
  clone,
  createSection,
  store,
  updateRecord
} = require("../utils/memoryStore");

const addSection = asyncHandler(async (req, res) => {
  if (!req.body.name) {
    return res.status(400).json({ success: false, message: "Section name is required" });
  }

  if (usingMemoryStore()) {
    const event = byEventOrSlug(req.params.eventId);
    if (!event) return res.status(404).json({ success: false, message: "Event not found" });
    if (!canManageEvent(req.user, event)) {
      return res.status(403).json({ success: false, message: "You can only manage your own events" });
    }
    const section = createSection(event, req.body);
    return res.status(201).json({ success: true, data: clone(section) });
  }

  const event = await Event.findById(req.params.eventId);
  if (!event) return res.status(404).json({ success: false, message: "Event not found" });
  if (!canManageEvent(req.user, event)) {
    return res.status(403).json({ success: false, message: "You can only manage your own events" });
  }
  const section = await Section.create({ ...req.body, event: event._id });
  res.status(201).json({ success: true, data: section });
});

const updateSection = asyncHandler(async (req, res) => {
  if (usingMemoryStore()) {
    const section = byId(store.sections, req.params.sectionId);
    if (!section) return res.status(404).json({ success: false, message: "Section not found" });
    const event = byEventOrSlug(section.event);
    if (!canManageEvent(req.user, event)) {
      return res.status(403).json({ success: false, message: "You can only manage your own events" });
    }
    return res.json({ success: true, data: clone(updateRecord(section, req.body)) });
  }

  const section = await Section.findById(req.params.sectionId);
  if (!section) return res.status(404).json({ success: false, message: "Section not found" });
  const event = await Event.findById(section.event);
  if (!canManageEvent(req.user, event)) {
    return res.status(403).json({ success: false, message: "You can only manage your own events" });
  }
  Object.assign(section, req.body);
  await section.save();
  res.json({ success: true, data: section });
});

const deleteSection = asyncHandler(async (req, res) => {
  if (usingMemoryStore()) {
    const section = byId(store.sections, req.params.sectionId);
    if (!section) return res.status(404).json({ success: false, message: "Section not found" });
    const event = byEventOrSlug(section.event);
    if (!canManageEvent(req.user, event)) {
      return res.status(403).json({ success: false, message: "You can only manage your own events" });
    }
    const id = section._id;
    store.sections = store.sections.filter((item) => item._id !== id);
    store.players = store.players.filter((item) => item.section !== id);
    store.rounds = store.rounds.filter((item) => item.section !== id);
    store.pairings = store.pairings.filter((item) => item.section !== id);
    return res.json({ success: true, data: { id } });
  }

  const section = await Section.findById(req.params.sectionId);
  if (!section) return res.status(404).json({ success: false, message: "Section not found" });
  const event = await Event.findById(section.event);
  if (!canManageEvent(req.user, event)) {
    return res.status(403).json({ success: false, message: "You can only manage your own events" });
  }
  await Promise.all([
    Player.deleteMany({ section: section._id }),
    Round.deleteMany({ section: section._id }),
    Pairing.deleteMany({ section: section._id }),
    section.deleteOne()
  ]);
  res.json({ success: true, data: { id: req.params.sectionId } });
});

module.exports = {
  addSection,
  updateSection,
  deleteSection
};
