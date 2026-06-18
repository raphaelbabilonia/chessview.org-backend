const Event = require("../models/Event");
const Section = require("../models/Section");
const Player = require("../models/Player");
const Pairing = require("../models/Pairing");
const { canManageEvent } = require("../utils/permissions");

const listPlayers = async (req, res) => {
  const filter = { event: req.params.eventId };
  if (req.query.section) filter.section = req.query.section;
  const players = await Player.find(filter).sort({ lastName: 1, firstName: 1 }).lean();
  res.json({ success: true, data: players });
};

const addPlayer = async (req, res) => {
  const { section } = req.body;
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
  const player = await Player.create({ ...req.body, event: event._id, section: targetSection._id });
  res.status(201).json({ success: true, data: player });
};

const updatePlayer = async (req, res) => {
  const player = await Player.findById(req.params.playerId);
  if (!player) return res.status(404).json({ success: false, message: "Player not found" });
  const event = await Event.findById(player.event);
  if (!canManageEvent(req.user, event)) {
    return res.status(403).json({ success: false, message: "You can only manage your own events" });
  }
  Object.assign(player, req.body);
  await player.save();
  res.json({ success: true, data: player });
};

const deletePlayer = async (req, res) => {
  const player = await Player.findById(req.params.playerId);
  if (!player) return res.status(404).json({ success: false, message: "Player not found" });
  const event = await Event.findById(player.event);
  if (!canManageEvent(req.user, event)) {
    return res.status(403).json({ success: false, message: "You can only manage your own events" });
  }
  await Promise.all([
    Pairing.deleteMany({ $or: [{ whitePlayer: player._id }, { blackPlayer: player._id }] }),
    player.deleteOne()
  ]);
  res.json({ success: true, data: { id: req.params.playerId } });
};

module.exports = {
  listPlayers,
  addPlayer,
  updatePlayer,
  deletePlayer
};
