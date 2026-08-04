const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const BroadcastSession = require("../models/BroadcastSession");
const Device = require("../models/Device");
const Event = require("../models/Event");
const Frame = require("../models/Frame");
const Pairing = require("../models/Pairing");
const { canManageEvent, canViewEvent } = require("../utils/permissions");
const { heartbeatSchema, frameUploadSchema } = require("../validation/deviceSchemas");

const uploadRoot = path.join(__dirname, "..", "..", "uploads", "broadcast");

const publicDevice = (device) => {
  if (!device) return null;
  const value = device.toObject ? device.toObject() : device;
  const { secretHash, ...safeDevice } = value;
  return safeDevice;
};

const randomSecret = () => crypto.randomBytes(24).toString("hex");

const randomDeviceId = () => `cv-clock-${crypto.randomBytes(3).toString("hex")}`;

const numberOrNull = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const removeUploadedFile = (file) => {
  if (file?.path) {
    fs.unlink(file.path, () => {});
  }
};

const imageUrlForFile = (file) => `/uploads/broadcast/${file.filename}`;

const findDeviceByPublicId = async (deviceId) => {
  return Device.findOne({ deviceId });
};

const authenticateDevice = async (req) => {
  const deviceId = req.get("X-Device-Id");
  const deviceSecret = req.get("X-Device-Secret");

  if (!deviceId || !deviceSecret) {
    return { error: { status: 401, message: "Device credentials are required" } };
  }

  const device = await findDeviceByPublicId(deviceId);
  if (!device) {
    return { error: { status: 401, message: "Unknown device" } };
  }

  if (device.status === "disabled") {
    return { error: { status: 403, message: "Device is disabled" } };
  }

  const valid = await bcrypt.compare(deviceSecret, device.secretHash);
  if (!valid) {
    return { error: { status: 401, message: "Invalid device secret" } };
  }

  return { device };
};

// Merge telemetry from a heartbeat *or* a frame upload onto the device. Only
// fields actually present in the payload are written, so a frame upload (which
// carries little telemetry) never clobbers the richer values from the last
// heartbeat, and vice-versa.
const updateDeviceTelemetry = async (device, body) => {
  device.lastSeenAt = new Date();
  if (device.status === "new") device.status = "active";
  if (body.firmwareVersion) device.firmwareVersion = body.firmwareVersion;

  const numeric = {
    lastBatteryMv: body.batteryMv,
    lastBatteryPercent: body.batteryPercent,
    lastRssi: body.rssi,
    lastQueuedEvents: body.queuedEvents,
    lastFreeStorageBytes: body.freeStorageBytes
  };
  for (const [field, value] of Object.entries(numeric)) {
    const parsed = numberOrNull(value);
    if (parsed !== null) device[field] = parsed;
  }

  if (typeof body.charging === "boolean") device.lastCharging = body.charging;
  if (body.clockState) device.lastClockState = body.clockState;
  if (body.activeBroadcastId) device.lastActiveBroadcastId = String(body.activeBroadcastId);

  await device.save();
  return device;
};

const createDevice = async (req, res) => {
  const deviceId = (req.body.deviceId || randomDeviceId()).trim();
  const name = (req.body.name || deviceId).trim();
  const deviceSecret = req.body.deviceSecret || randomSecret();
  const secretHash = await bcrypt.hash(deviceSecret, 10);

  const existing = await Device.findOne({ deviceId });
  if (existing) {
    return res.status(409).json({ success: false, message: "Device ID already exists" });
  }

  const device = await Device.create({
    deviceId,
    name,
    secretHash,
    firmwareVersion: req.body.firmwareVersion || "",
    notes: req.body.notes || ""
  });
  res.status(201).json({
    success: true,
    data: {
      ...publicDevice(device),
      deviceSecret
    }
  });
};

const listDevices = async (req, res) => {
  const devices = await Device.find().sort({ createdAt: -1 }).lean();
  res.json({ success: true, data: devices.map(publicDevice) });
};

const updateDevice = async (req, res) => {
  const updates = {};
  if (req.body.name !== undefined) updates.name = req.body.name.trim();
  if (req.body.notes !== undefined) updates.notes = req.body.notes;
  if (req.body.status !== undefined) updates.status = req.body.status;

  const device = await Device.findOneAndUpdate({ deviceId: req.params.deviceId }, updates, {
    new: true,
    runValidators: true
  });
  if (!device) return res.status(404).json({ success: false, message: "Device not found" });
  res.json({ success: true, data: publicDevice(device) });
};

const startBroadcast = async (req, res) => {
  const orientation = req.body.orientation || "unknown";
  const pairing = await Pairing.findById(req.params.pairingId);
  if (!pairing) return res.status(404).json({ success: false, message: "Pairing not found" });
  const [event, device] = await Promise.all([
    Event.findById(pairing.event),
    Device.findOne({ deviceId: req.body.deviceId })
  ]);
  if (!canManageEvent(req.user, event)) {
    return res.status(403).json({ success: false, message: "You can only manage your own events" });
  }
  if (!device) return res.status(404).json({ success: false, message: "Device not found" });
  if (device.status === "disabled") {
    return res.status(400).json({ success: false, message: "Device is disabled" });
  }

  const existing = await BroadcastSession.findOne({
    pairing: pairing._id,
    status: { $in: ["setup", "live"] }
  });
  const data = {
    event: pairing.event,
    section: pairing.section,
    round: pairing.round,
    pairing: pairing._id,
    boardNumber: pairing.boardNumber,
    device: device._id,
    status: "live",
    startedAt: new Date(),
    endedAt: null,
    orientation,
    calibration: req.body.calibration || null
  };
  const session = existing
    ? await BroadcastSession.findByIdAndUpdate(existing._id, data, { new: true })
    : await BroadcastSession.create(data);
  res.status(existing ? 200 : 201).json({ success: true, data: session });
};

const endBroadcast = async (req, res) => {
  const session = await BroadcastSession.findById(req.params.broadcastId);
  if (!session) return res.status(404).json({ success: false, message: "Broadcast not found" });
  const event = await Event.findById(session.event);
  if (!canManageEvent(req.user, event)) {
    return res.status(403).json({ success: false, message: "You can only manage your own events" });
  }
  session.status = "ended";
  session.endedAt = new Date();
  await session.save();
  res.json({ success: true, data: session });
};

const getPairingBroadcast = async (req, res) => {
  const pairing = await Pairing.findById(req.params.pairingId).lean();
  if (!pairing) return res.status(404).json({ success: false, message: "Pairing not found" });
  const event = await Event.findById(pairing.event);
  if (!canViewEvent(req.user, event)) {
    return res.status(403).json({ success: false, message: "This event is not public" });
  }
  const session = await BroadcastSession.findOne({ pairing: req.params.pairingId }).sort({ createdAt: -1 }).lean();
  const frames = session ? await Frame.find({ broadcast: session._id }).sort({ deviceSeq: 1 }).lean() : [];
  res.json({ success: true, data: { session, frames } });
};

const listBroadcastFrames = async (req, res) => {
  const session = await BroadcastSession.findById(req.params.broadcastId).lean();
  if (!session) return res.status(404).json({ success: false, message: "Broadcast not found" });
  const event = await Event.findById(session.event);
  if (!canViewEvent(req.user, event)) {
    return res.status(403).json({ success: false, message: "This event is not public" });
  }
  const frames = await Frame.find({ broadcast: req.params.broadcastId }).sort({ deviceSeq: 1 }).lean();
  res.json({ success: true, data: frames });
};

// Parses a request body against a zod schema, returning either { data } or a
// { status, message } error shaped for the device endpoints (contract uses 400
// for a bad payload, not the validate() middleware's 422).
const parseBody = (schema, body) => {
  const result = schema.safeParse(body);
  if (result.success) return { data: result.data };
  const flat = result.error.flatten();
  const [field, messages] = Object.entries(flat.fieldErrors)[0] || [];
  const message = messages ? `${field}: ${messages[0]}` : flat.formErrors[0] || "Invalid payload";
  return { error: { status: 400, message } };
};

// ply 1 = white's first move, 2 = black's first, ... so an odd ply means white
// just moved. moveNumber is the full-move counter (white 1 + black 1 both == 1).
const sideFromPly = (ply) => (ply % 2 === 1 ? "white" : "black");
const moveNumberFromPly = (ply) => Math.ceil(ply / 2);

// The contract says the backend must store incoherent metadata but flag it,
// rather than trusting or rejecting it. These are cheap sanity checks over the
// values the device actually sent (not the ones we derive ourselves).
const detectAnomalies = (data) => {
  const anomalies = [];
  if (data.ply !== undefined && data.sideJustMoved && data.sideJustMoved !== "unknown") {
    if (sideFromPly(data.ply) !== data.sideJustMoved) anomalies.push("ply-side-mismatch");
  }
  if (data.ply !== undefined && data.moveNumber !== undefined) {
    if (moveNumberFromPly(data.ply) !== data.moveNumber) anomalies.push("move-number-mismatch");
  }
  for (const [field, key] of [
    ["negative-white-clock", "whiteRemainingMs"],
    ["negative-black-clock", "blackRemainingMs"],
    ["negative-move-duration", "moveDurationMs"]
  ]) {
    if (data[key] !== undefined && data[key] < 0) anomalies.push(field);
  }
  return anomalies;
};

const deviceHeartbeat = async (req, res) => {
  const { device, error } = await authenticateDevice(req);
  if (error) return res.status(error.status).json({ success: false, message: error.message });

  const parsed = parseBody(heartbeatSchema, req.body);
  if (parsed.error) {
    return res.status(parsed.error.status).json({ success: false, message: parsed.error.message });
  }

  const updated = await updateDeviceTelemetry(device, parsed.data);
  // Trimmed, device-facing shape per the clock->backend contract (not the full
  // dashboard device object).
  res.json({
    success: true,
    data: {
      deviceId: updated.deviceId,
      status: updated.status,
      lastSeenAt: updated.lastSeenAt,
      lastBatteryMv: updated.lastBatteryMv,
      lastRssi: updated.lastRssi
    }
  });
};

// Shapes a stored frame into the contract's move-frame response. `deduplicated`
// tells the device an idempotent retry hit an existing record.
const frameResponse = (frame, deduplicated) => ({
  frameId: frame._id,
  imageClientId: frame.imageClientId || null,
  imageUrl: frame.imageUrl,
  status: frame.status,
  deduplicated
});

const deviceFrameUpload = async (req, res) => {
  const { device, error } = await authenticateDevice(req);
  if (error) {
    removeUploadedFile(req.file);
    return res.status(error.status).json({ success: false, message: error.message });
  }

  if (!req.file) {
    return res.status(400).json({ success: false, message: "JPEG image file is required" });
  }

  const parsed = parseBody(frameUploadSchema, req.body);
  if (parsed.error) {
    removeUploadedFile(req.file);
    return res.status(parsed.error.status).json({ success: false, message: parsed.error.message });
  }
  const data = parsed.data;

  // Frame uploads also carry live telemetry (battery/rssi/firmware at capture).
  await updateDeviceTelemetry(device, data);

  const session = await BroadcastSession.findById(data.broadcastId);
  if (!session || session.status !== "live") {
    removeUploadedFile(req.file);
    return res.status(400).json({ success: false, message: "Broadcast is not live" });
  }
  if (String(session.device) !== String(device._id)) {
    removeUploadedFile(req.file);
    return res.status(403).json({ success: false, message: "Device is not assigned to this broadcast" });
  }
  // If the device asserts a pairingId it must match the broadcast's game.
  if (data.pairingId && String(session.pairing) !== String(data.pairingId)) {
    removeUploadedFile(req.file);
    return res.status(409).json({ success: false, message: "pairingId does not match this broadcast" });
  }

  // Idempotent retry: same (device, deviceSeq) or (device, imageClientId) returns
  // the already-stored frame instead of creating a duplicate (flaky networking).
  const dedupKeys = [{ device: device._id, deviceSeq: data.deviceSeq }];
  if (data.imageClientId) dedupKeys.push({ device: device._id, imageClientId: data.imageClientId });
  const existing = await Frame.findOne({ $or: dedupKeys });
  if (existing) {
    removeUploadedFile(req.file);
    return res.json({ success: true, data: frameResponse(existing, true) });
  }

  // ply defaults to deviceSeq when the clock can't supply it; moveNumber is
  // derived from whichever ply we end up with. sideJustMoved is only inferred
  // when the device actually sent a ply (never fabricated from the fallback).
  const ply = data.ply ?? data.deviceSeq;
  const moveNumber = data.moveNumber ?? moveNumberFromPly(ply);
  const sideJustMoved =
    data.sideJustMoved ?? (data.ply !== undefined ? sideFromPly(data.ply) : "unknown");

  const frameDoc = {
    broadcast: session._id,
    device: device._id,
    pairing: session.pairing,
    deviceSeq: data.deviceSeq,
    capturedAt: data.capturedAt || new Date().toISOString(),
    imageCapturedAt: data.imageCapturedAt || "",
    pressedAt: data.pressedAt || "",
    imageUrl: imageUrlForFile(req.file),
    mimeType: req.file.mimetype,
    sizeBytes: req.file.size,
    width: data.imageWidth ?? null,
    height: data.imageHeight ?? null,
    jpegSha256: data.jpegSha256 || "",
    ply,
    moveNumber,
    sideJustMoved,
    sideToMove: data.sideToMove || "unknown",
    whiteRemainingMs: data.whiteRemainingMs ?? null,
    blackRemainingMs: data.blackRemainingMs ?? null,
    moveDurationMs: data.moveDurationMs ?? null,
    clockStateAfterPress: data.clockStateAfterPress || "unknown",
    batteryMv: numberOrNull(data.batteryMv),
    rssi: numberOrNull(data.rssi),
    firmwareVersion: data.firmwareVersion || "",
    anomalies: detectAnomalies(data)
  };
  if (data.imageClientId) frameDoc.imageClientId = data.imageClientId;

  let frame;
  try {
    frame = await Frame.create(frameDoc);
  } catch (err) {
    // A concurrent retry can lose the create race and hit the unique index; treat
    // it as the dedup case and return the winner instead of a 500.
    if (err.code === 11000) {
      removeUploadedFile(req.file);
      const winner = await Frame.findOne({ $or: dedupKeys });
      if (winner) return res.json({ success: true, data: frameResponse(winner, true) });
    }
    throw err;
  }
  res.status(201).json({ success: true, data: frameResponse(frame, false) });
};

module.exports = {
  uploadRoot,
  createDevice,
  listDevices,
  updateDevice,
  startBroadcast,
  endBroadcast,
  getPairingBroadcast,
  listBroadcastFrames,
  deviceHeartbeat,
  deviceFrameUpload
};
