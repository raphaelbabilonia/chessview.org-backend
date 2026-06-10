const Event = require("../models/Event");
const Section = require("../models/Section");
const Registration = require("../models/Registration");
const Player = require("../models/Player");
const asyncHandler = require("../utils/asyncHandler");
const { canManageEvent } = require("../utils/permissions");
const { usingMemoryStore } = require("../config/db");
const {
  byEventOrSlug,
  byId,
  clone,
  createPlayer,
  createRegistration,
  store,
  updateRecord
} = require("../utils/memoryStore");

const createEventRegistration = asyncHandler(async (req, res) => {
  const { firstName, lastName, email, section } = req.body;
  if (!firstName || !lastName || !email || !section) {
    return res.status(400).json({ success: false, message: "First name, last name, email, and section are required" });
  }

  if (usingMemoryStore()) {
    const event = byEventOrSlug(req.params.eventId);
    const targetSection = byId(store.sections, section);
    if (!event || !targetSection || targetSection.event !== event._id) {
      return res.status(404).json({ success: false, message: "Event or section not found" });
    }
    if (event.registrationStatus !== "open") {
      return res.status(400).json({ success: false, message: "Registrations are not open for this event" });
    }
    const registration = createRegistration(event, targetSection, req.user, req.body);
    return res.status(201).json({ success: true, data: clone(registration) });
  }

  const [event, targetSection] = await Promise.all([
    Event.findById(req.params.eventId),
    Section.findById(section)
  ]);
  if (!event || !targetSection || String(targetSection.event) !== String(event._id)) {
    return res.status(404).json({ success: false, message: "Event or section not found" });
  }
  if (event.registrationStatus !== "open") {
    return res.status(400).json({ success: false, message: "Registrations are not open for this event" });
  }
  const registration = await Registration.create({
    ...req.body,
    event: event._id,
    section: targetSection._id,
    user: req.user._id,
    status: "pending"
  });
  res.status(201).json({ success: true, data: registration });
});

const listRegistrations = asyncHandler(async (req, res) => {
  if (usingMemoryStore()) {
    const event = byEventOrSlug(req.params.eventId);
    if (!event) return res.status(404).json({ success: false, message: "Event not found" });
    if (!canManageEvent(req.user, event)) {
      return res.status(403).json({ success: false, message: "You can only manage your own events" });
    }
    return res.json({
      success: true,
      data: clone(store.registrations.filter((registration) => registration.event === event._id))
    });
  }

  const event = await Event.findById(req.params.eventId);
  if (!event) return res.status(404).json({ success: false, message: "Event not found" });
  if (!canManageEvent(req.user, event)) {
    return res.status(403).json({ success: false, message: "You can only manage your own events" });
  }
  const registrations = await Registration.find({ event: event._id }).sort({ createdAt: -1 }).lean();
  res.json({ success: true, data: registrations });
});

const updateRegistrationStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!["pending", "approved", "cancelled", "rejected"].includes(status)) {
    return res.status(400).json({ success: false, message: "Invalid registration status" });
  }

  if (usingMemoryStore()) {
    const registration = byId(store.registrations, req.params.registrationId);
    if (!registration) return res.status(404).json({ success: false, message: "Registration not found" });
    const event = byEventOrSlug(registration.event);
    const section = byId(store.sections, registration.section);
    if (!canManageEvent(req.user, event)) {
      return res.status(403).json({ success: false, message: "You can only manage your own events" });
    }
    updateRecord(registration, { status });
    if (status === "approved") {
      const exists = store.players.some(
        (player) => player.event === event._id && player.email && player.email === registration.email
      );
      if (!exists) createPlayer(event, section, registration);
    }
    return res.json({ success: true, data: clone(registration) });
  }

  const registration = await Registration.findById(req.params.registrationId);
  if (!registration) return res.status(404).json({ success: false, message: "Registration not found" });
  const [event, section] = await Promise.all([
    Event.findById(registration.event),
    Section.findById(registration.section)
  ]);
  if (!canManageEvent(req.user, event)) {
    return res.status(403).json({ success: false, message: "You can only manage your own events" });
  }
  registration.status = status;
  await registration.save();
  if (status === "approved") {
    const exists = await Player.findOne({ event: event._id, email: registration.email });
    if (!exists) {
      await Player.create({
        event: event._id,
        section: section._id,
        user: registration.user,
        firstName: registration.firstName,
        lastName: registration.lastName,
        email: registration.email,
        club: registration.club,
        rating: registration.rating,
        birthYear: registration.birthYear
      });
    }
  }
  res.json({ success: true, data: registration });
});

module.exports = {
  createEventRegistration,
  listRegistrations,
  updateRegistrationStatus
};
