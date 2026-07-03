const Player = require("../models/Player");
const Pairing = require("../models/Pairing");
const Event = require("../models/Event");
const Section = require("../models/Section");
const calculateStandings = require("../utils/calculateStandings");
const { canManageEvent, canViewEvent } = require("../utils/permissions");
const { publicPlayer } = require("../utils/publicSerializers");

const standingsByEvent = async (req, res) => {
  const event = await Event.findById(req.params.eventId);
  if (!event) return res.status(404).json({ success: false, message: "Event not found" });
  if (!canViewEvent(req.user, event)) {
    return res.status(403).json({ success: false, message: "This event is not public" });
  }
  const [players, pairings] = await Promise.all([
    Player.find({ event: event._id }).lean(),
    Pairing.find({ event: event._id }).lean()
  ]);
  const safePlayers = canManageEvent(req.user, event) ? players : players.map(publicPlayer);
  res.json({ success: true, data: calculateStandings(safePlayers, pairings) });
};

const standingsBySection = async (req, res) => {
  const section = await Section.findById(req.params.sectionId);
  if (!section) return res.status(404).json({ success: false, message: "Section not found" });
  const event = await Event.findById(section.event);
  if (!canViewEvent(req.user, event)) {
    return res.status(403).json({ success: false, message: "This event is not public" });
  }
  const [players, pairings] = await Promise.all([
    Player.find({ section: section._id }).lean(),
    Pairing.find({ section: section._id }).lean()
  ]);
  const safePlayers = canManageEvent(req.user, event) ? players : players.map(publicPlayer);
  res.json({ success: true, data: calculateStandings(safePlayers, pairings) });
};

module.exports = {
  standingsByEvent,
  standingsBySection
};
