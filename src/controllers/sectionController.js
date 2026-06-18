const Event = require("../models/Event");
const Section = require("../models/Section");
const Player = require("../models/Player");
const Round = require("../models/Round");
const Pairing = require("../models/Pairing");
const { canManageEvent } = require("../utils/permissions");

const addSection = async (req, res) => {
  if (!req.body.name) {
    return res.status(400).json({ success: false, message: "Section name is required" });
  }

  const event = await Event.findById(req.params.eventId);
  if (!event) return res.status(404).json({ success: false, message: "Event not found" });
  if (!canManageEvent(req.user, event)) {
    return res.status(403).json({ success: false, message: "You can only manage your own events" });
  }
  const section = await Section.create({ ...req.body, event: event._id });
  res.status(201).json({ success: true, data: section });
};

const updateSection = async (req, res) => {
  const section = await Section.findById(req.params.sectionId);
  if (!section) return res.status(404).json({ success: false, message: "Section not found" });
  const event = await Event.findById(section.event);
  if (!canManageEvent(req.user, event)) {
    return res.status(403).json({ success: false, message: "You can only manage your own events" });
  }
  Object.assign(section, req.body);
  await section.save();
  res.json({ success: true, data: section });
};

const deleteSection = async (req, res) => {
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
};

module.exports = {
  addSection,
  updateSection,
  deleteSection
};
