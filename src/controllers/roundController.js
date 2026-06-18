const Event = require("../models/Event");
const Section = require("../models/Section");
const Round = require("../models/Round");
const { canManageEvent } = require("../utils/permissions");

const listRounds = async (req, res) => {
  const filter = { event: req.params.eventId };
  if (req.query.section) filter.section = req.query.section;
  const rounds = await Round.find(filter).sort({ number: 1 }).lean();
  res.json({ success: true, data: rounds });
};

const addRound = async (req, res) => {
  const { section, number } = req.body;
  if (!section || !number) {
    return res.status(400).json({ success: false, message: "Section and round number are required" });
  }

  const [event, targetSection] = await Promise.all([
    Event.findById(req.params.eventId),
    Section.findById(section)
  ]);
  if (!event || !targetSection || String(targetSection.event) !== String(event._id)) {
    return res.status(404).json({ success: false, message: "Event or section not found" });
  }
  if (!canManageEvent(req.user, event)) {
    return res.status(403).json({ success: false, message: "You can only manage your own events" });
  }
  const round = await Round.create({ ...req.body, event: event._id, section: targetSection._id });
  res.status(201).json({ success: true, data: round });
};

const updateRound = async (req, res) => {
  const round = await Round.findById(req.params.roundId);
  if (!round) return res.status(404).json({ success: false, message: "Round not found" });
  const event = await Event.findById(round.event);
  if (!canManageEvent(req.user, event)) {
    return res.status(403).json({ success: false, message: "You can only manage your own events" });
  }
  Object.assign(round, req.body);
  await round.save();
  res.json({ success: true, data: round });
};

module.exports = {
  listRounds,
  addRound,
  updateRound
};
