const Event = require("../models/Event");
const Section = require("../models/Section");
const Registration = require("../models/Registration");
const Player = require("../models/Player");
const { canManageEvent } = require("../utils/permissions");

const createEventRegistration = async (req, res) => {
  const { section } = req.body;
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
};

const listRegistrations = async (req, res) => {
  const event = await Event.findById(req.params.eventId);
  if (!event) return res.status(404).json({ success: false, message: "Event not found" });
  if (!canManageEvent(req.user, event)) {
    return res.status(403).json({ success: false, message: "You can only manage your own events" });
  }
  const registrations = await Registration.find({ event: event._id }).sort({ createdAt: -1 }).lean();
  res.json({ success: true, data: registrations });
};

const updateRegistrationStatus = async (req, res) => {
  const { status } = req.body;
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
};

module.exports = {
  createEventRegistration,
  listRegistrations,
  updateRegistrationStatus
};
