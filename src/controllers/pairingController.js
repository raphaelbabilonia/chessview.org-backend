const Event = require("../models/Event");
const Round = require("../models/Round");
const Pairing = require("../models/Pairing");
const Player = require("../models/Player");
const asyncHandler = require("../utils/asyncHandler");
const { canManageEvent } = require("../utils/permissions");
const { usingMemoryStore } = require("../config/db");
const {
  byEventOrSlug,
  byId,
  clone,
  createPairing,
  store,
  updateRecord
} = require("../utils/memoryStore");

const listPairings = asyncHandler(async (req, res) => {
  if (usingMemoryStore()) {
    const round = byId(store.rounds, req.params.roundId);
    if (!round) return res.status(404).json({ success: false, message: "Round not found" });
    const pairings = store.pairings
      .filter((pairing) => pairing.round === round._id)
      .sort((a, b) => a.boardNumber - b.boardNumber);
    return res.json({ success: true, data: clone(pairings) });
  }

  const pairings = await Pairing.find({ round: req.params.roundId }).sort({ boardNumber: 1 }).lean();
  res.json({ success: true, data: pairings });
});

const addPairing = asyncHandler(async (req, res) => {
  const { boardNumber, whitePlayer } = req.body;
  if (!boardNumber || !whitePlayer) {
    return res.status(400).json({ success: false, message: "Board number and white player are required" });
  }

  if (usingMemoryStore()) {
    const round = byId(store.rounds, req.params.roundId);
    if (!round) return res.status(404).json({ success: false, message: "Round not found" });
    const event = byEventOrSlug(round.event);
    const section = byId(store.sections, round.section);
    const white = byId(store.players, whitePlayer);
    const black = req.body.blackPlayer ? byId(store.players, req.body.blackPlayer) : null;
    if (!white || (req.body.blackPlayer && !black)) {
      return res.status(404).json({ success: false, message: "Player not found" });
    }
    if (!canManageEvent(req.user, event)) {
      return res.status(403).json({ success: false, message: "You can only manage your own events" });
    }
    const pairing = createPairing(event, section, round, req.body);
    return res.status(201).json({ success: true, data: clone(pairing) });
  }

  const round = await Round.findById(req.params.roundId);
  if (!round) return res.status(404).json({ success: false, message: "Round not found" });
  const [event, white, black] = await Promise.all([
    Event.findById(round.event),
    Player.findById(whitePlayer),
    req.body.blackPlayer ? Player.findById(req.body.blackPlayer) : Promise.resolve(null)
  ]);
  if (!white || (req.body.blackPlayer && !black)) {
    return res.status(404).json({ success: false, message: "Player not found" });
  }
  if (!canManageEvent(req.user, event)) {
    return res.status(403).json({ success: false, message: "You can only manage your own events" });
  }
  const pairing = await Pairing.create({
    ...req.body,
    event: event._id,
    section: round.section,
    round: round._id
  });
  res.status(201).json({ success: true, data: pairing });
});

const updatePairingResult = asyncHandler(async (req, res) => {
  const { result } = req.body;
  const allowed = [
    "pending",
    "1-0",
    "0-1",
    "1/2-1/2",
    "bye-white",
    "bye-black",
    "forfeit-white",
    "forfeit-black"
  ];
  if (!allowed.includes(result)) {
    return res.status(400).json({ success: false, message: "Invalid result" });
  }

  if (usingMemoryStore()) {
    const pairing = byId(store.pairings, req.params.pairingId);
    if (!pairing) return res.status(404).json({ success: false, message: "Pairing not found" });
    const event = byEventOrSlug(pairing.event);
    if (!canManageEvent(req.user, event)) {
      return res.status(403).json({ success: false, message: "You can only manage your own events" });
    }
    return res.json({ success: true, data: clone(updateRecord(pairing, { result, notes: req.body.notes || pairing.notes })) });
  }

  const pairing = await Pairing.findById(req.params.pairingId);
  if (!pairing) return res.status(404).json({ success: false, message: "Pairing not found" });
  const event = await Event.findById(pairing.event);
  if (!canManageEvent(req.user, event)) {
    return res.status(403).json({ success: false, message: "You can only manage your own events" });
  }
  pairing.result = result;
  if (req.body.notes !== undefined) pairing.notes = req.body.notes;
  await pairing.save();
  res.json({ success: true, data: pairing });
});

module.exports = {
  listPairings,
  addPairing,
  updatePairingResult
};
