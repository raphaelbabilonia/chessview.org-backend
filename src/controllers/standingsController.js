const Player = require("../models/Player");
const Pairing = require("../models/Pairing");
const Event = require("../models/Event");
const Section = require("../models/Section");
const calculateStandings = require("../utils/calculateStandings");
const { usingMemoryStore } = require("../config/db");
const { byEventOrSlug, byId, store } = require("../utils/memoryStore");

const standingsByEvent = async (req, res) => {
  if (usingMemoryStore()) {
    const event = byEventOrSlug(req.params.eventId);
    if (!event) return res.status(404).json({ success: false, message: "Event not found" });
    const players = store.players.filter((player) => player.event === event._id);
    const pairings = store.pairings.filter((pairing) => pairing.event === event._id);
    return res.json({ success: true, data: calculateStandings(players, pairings) });
  }

  const event = await Event.findById(req.params.eventId);
  if (!event) return res.status(404).json({ success: false, message: "Event not found" });
  const [players, pairings] = await Promise.all([
    Player.find({ event: event._id }).lean(),
    Pairing.find({ event: event._id }).lean()
  ]);
  res.json({ success: true, data: calculateStandings(players, pairings) });
};

const standingsBySection = async (req, res) => {
  if (usingMemoryStore()) {
    const section = byId(store.sections, req.params.sectionId);
    if (!section) return res.status(404).json({ success: false, message: "Section not found" });
    const players = store.players.filter((player) => player.section === section._id);
    const pairings = store.pairings.filter((pairing) => pairing.section === section._id);
    return res.json({ success: true, data: calculateStandings(players, pairings) });
  }

  const section = await Section.findById(req.params.sectionId);
  if (!section) return res.status(404).json({ success: false, message: "Section not found" });
  const [players, pairings] = await Promise.all([
    Player.find({ section: section._id }).lean(),
    Pairing.find({ section: section._id }).lean()
  ]);
  res.json({ success: true, data: calculateStandings(players, pairings) });
};

module.exports = {
  standingsByEvent,
  standingsBySection
};
