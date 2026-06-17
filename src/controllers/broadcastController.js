const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const BroadcastSession = require("../models/BroadcastSession");
const Device = require("../models/Device");
const Event = require("../models/Event");
const Frame = require("../models/Frame");
const Pairing = require("../models/Pairing");
const { canManageEvent } = require("../utils/permissions");
const { usingMemoryStore } = require("../config/db");
const { byEventOrSlug, byId, clone, createRecord, store, updateRecord } = require("../utils/memoryStore");

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
  if (usingMemoryStore()) {
    return store.devices.find((device) => device.deviceId === deviceId);
  }
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

const updateDeviceTelemetry = async (device, body) => {
  const data = {
    firmwareVersion: body.firmwareVersion || device.firmwareVersion || "",
    status: device.status === "new" ? "active" : device.status,
    lastSeenAt: new Date(),
    lastBatteryMv: numberOrNull(body.batteryMv),
    lastRssi: numberOrNull(body.rssi)
  };

  if (usingMemoryStore()) {
    return updateRecord(device, {
      ...data,
      lastSeenAt: data.lastSeenAt.toISOString()
    });
  }

  Object.assign(device, data);
  await device.save();
  return device;
};

const createDevice = async (req, res) => {
  const deviceId = (req.body.deviceId || randomDeviceId()).trim();
  const name = (req.body.name || deviceId).trim();
  const deviceSecret = req.body.deviceSecret || randomSecret();
  const secretHash = await bcrypt.hash(deviceSecret, 10);

  if (usingMemoryStore()) {
    const existing = store.devices.find((device) => device.deviceId === deviceId);
    if (existing) {
      return res.status(409).json({ success: false, message: "Device ID already exists" });
    }
    const device = createRecord(store.devices, {
      deviceId,
      name,
      secretHash,
      firmwareVersion: req.body.firmwareVersion || "",
      status: "new",
      lastSeenAt: null,
      lastBatteryMv: null,
      lastRssi: null,
      notes: req.body.notes || ""
    });
    return res.status(201).json({
      success: true,
      data: {
        ...publicDevice(device),
        deviceSecret
      }
    });
  }

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
  if (usingMemoryStore()) {
    return res.json({ success: true, data: clone(store.devices.map(publicDevice)) });
  }

  const devices = await Device.find().sort({ createdAt: -1 }).lean();
  res.json({ success: true, data: devices.map(publicDevice) });
};

const updateDevice = async (req, res) => {
  const allowedStatus = ["new", "active", "disabled"];
  const updates = {};
  if (req.body.name !== undefined) updates.name = String(req.body.name).trim();
  if (req.body.notes !== undefined) updates.notes = String(req.body.notes);
  if (req.body.status !== undefined) {
    if (!allowedStatus.includes(req.body.status)) {
      return res.status(400).json({ success: false, message: "Invalid device status" });
    }
    updates.status = req.body.status;
  }

  if (usingMemoryStore()) {
    const device = store.devices.find((candidate) => candidate.deviceId === req.params.deviceId);
    if (!device) return res.status(404).json({ success: false, message: "Device not found" });
    return res.json({ success: true, data: clone(publicDevice(updateRecord(device, updates))) });
  }

  const device = await Device.findOneAndUpdate({ deviceId: req.params.deviceId }, updates, {
    new: true,
    runValidators: true
  });
  if (!device) return res.status(404).json({ success: false, message: "Device not found" });
  res.json({ success: true, data: publicDevice(device) });
};

const startBroadcast = async (req, res) => {
  const orientation = req.body.orientation || "unknown";
  if (!["whiteBottom", "blackBottom", "unknown"].includes(orientation)) {
    return res.status(400).json({ success: false, message: "Invalid orientation" });
  }

  if (usingMemoryStore()) {
    const pairing = byId(store.pairings, req.params.pairingId);
    if (!pairing) return res.status(404).json({ success: false, message: "Pairing not found" });
    const event = byEventOrSlug(pairing.event);
    if (!canManageEvent(req.user, event)) {
      return res.status(403).json({ success: false, message: "You can only manage your own events" });
    }
    const device = store.devices.find((candidate) => candidate.deviceId === req.body.deviceId);
    if (!device) return res.status(404).json({ success: false, message: "Device not found" });
    if (device.status === "disabled") {
      return res.status(400).json({ success: false, message: "Device is disabled" });
    }

    const existing = store.broadcastSessions.find(
      (session) => session.pairing === pairing._id && ["setup", "live"].includes(session.status)
    );
    const data = {
      event: pairing.event,
      section: pairing.section,
      round: pairing.round,
      pairing: pairing._id,
      boardNumber: pairing.boardNumber,
      device: device._id,
      status: "live",
      startedAt: new Date().toISOString(),
      endedAt: null,
      orientation,
      calibration: req.body.calibration || null
    };
    const session = existing ? updateRecord(existing, data) : createRecord(store.broadcastSessions, data);
    return res.status(existing ? 200 : 201).json({ success: true, data: clone(session) });
  }

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
  if (usingMemoryStore()) {
    const session = byId(store.broadcastSessions, req.params.broadcastId);
    if (!session) return res.status(404).json({ success: false, message: "Broadcast not found" });
    const event = byEventOrSlug(session.event);
    if (!canManageEvent(req.user, event)) {
      return res.status(403).json({ success: false, message: "You can only manage your own events" });
    }
    return res.json({
      success: true,
      data: clone(updateRecord(session, { status: "ended", endedAt: new Date().toISOString() }))
    });
  }

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
  if (usingMemoryStore()) {
    const sessions = store.broadcastSessions
      .filter((session) => session.pairing === req.params.pairingId)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const session = sessions[0] || null;
    const frames = session
      ? store.frames
          .filter((frame) => frame.broadcast === session._id)
          .sort((a, b) => a.deviceSeq - b.deviceSeq)
      : [];
    return res.json({ success: true, data: { session: clone(session), frames: clone(frames) } });
  }

  const session = await BroadcastSession.findOne({ pairing: req.params.pairingId }).sort({ createdAt: -1 }).lean();
  const frames = session ? await Frame.find({ broadcast: session._id }).sort({ deviceSeq: 1 }).lean() : [];
  res.json({ success: true, data: { session, frames } });
};

const listBroadcastFrames = async (req, res) => {
  if (usingMemoryStore()) {
    const frames = store.frames
      .filter((frame) => frame.broadcast === req.params.broadcastId)
      .sort((a, b) => a.deviceSeq - b.deviceSeq);
    return res.json({ success: true, data: clone(frames) });
  }

  const frames = await Frame.find({ broadcast: req.params.broadcastId }).sort({ deviceSeq: 1 }).lean();
  res.json({ success: true, data: frames });
};

const deviceHeartbeat = async (req, res) => {
  const { device, error } = await authenticateDevice(req);
  if (error) return res.status(error.status).json({ success: false, message: error.message });

  const updated = await updateDeviceTelemetry(device, req.body);
  res.json({ success: true, data: publicDevice(updated) });
};

const deviceFrameUpload = async (req, res) => {
  const { device, error } = await authenticateDevice(req);
  if (error) {
    removeUploadedFile(req.file);
    return res.status(error.status).json({ success: false, message: error.message });
  }

  if (!req.file) {
    return res.status(400).json({ success: false, message: "JPEG image file is required" });
  }

  const deviceSeq = Number(req.body.deviceSeq);
  if (!Number.isInteger(deviceSeq) || deviceSeq <= 0) {
    removeUploadedFile(req.file);
    return res.status(400).json({ success: false, message: "Valid deviceSeq is required" });
  }

  await updateDeviceTelemetry(device, req.body);

  if (usingMemoryStore()) {
    const session = byId(store.broadcastSessions, req.body.broadcastId);
    if (!session || session.status !== "live") {
      removeUploadedFile(req.file);
      return res.status(400).json({ success: false, message: "Broadcast is not live" });
    }
    if (session.device !== device._id) {
      removeUploadedFile(req.file);
      return res.status(403).json({ success: false, message: "Device is not assigned to this broadcast" });
    }
    const existing = store.frames.find((frame) => frame.device === device._id && frame.deviceSeq === deviceSeq);
    if (existing) {
      removeUploadedFile(req.file);
      return res.json({
        success: true,
        data: {
          frameId: existing._id,
          imageUrl: existing.imageUrl,
          status: existing.status
        }
      });
    }
    const frame = createRecord(store.frames, {
      broadcast: session._id,
      device: device._id,
      deviceSeq,
      capturedAt: req.body.capturedAt || new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      imageUrl: imageUrlForFile(req.file),
      thumbnailUrl: "",
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
      width: null,
      height: null,
      batteryMv: numberOrNull(req.body.batteryMv),
      rssi: numberOrNull(req.body.rssi),
      firmwareVersion: req.body.firmwareVersion || "",
      status: "received",
      rejectionReason: ""
    });
    return res.status(201).json({
      success: true,
      data: {
        frameId: frame._id,
        imageUrl: frame.imageUrl,
        status: frame.status
      }
    });
  }

  const session = await BroadcastSession.findById(req.body.broadcastId);
  if (!session || session.status !== "live") {
    removeUploadedFile(req.file);
    return res.status(400).json({ success: false, message: "Broadcast is not live" });
  }
  if (String(session.device) !== String(device._id)) {
    removeUploadedFile(req.file);
    return res.status(403).json({ success: false, message: "Device is not assigned to this broadcast" });
  }

  const existing = await Frame.findOne({ device: device._id, deviceSeq });
  if (existing) {
    removeUploadedFile(req.file);
    return res.json({
      success: true,
      data: {
        frameId: existing._id,
        imageUrl: existing.imageUrl,
        status: existing.status
      }
    });
  }

  const frame = await Frame.create({
    broadcast: session._id,
    device: device._id,
    deviceSeq,
    capturedAt: req.body.capturedAt || new Date().toISOString(),
    imageUrl: imageUrlForFile(req.file),
    mimeType: req.file.mimetype,
    sizeBytes: req.file.size,
    batteryMv: numberOrNull(req.body.batteryMv),
    rssi: numberOrNull(req.body.rssi),
    firmwareVersion: req.body.firmwareVersion || ""
  });
  res.status(201).json({
    success: true,
    data: {
      frameId: frame._id,
      imageUrl: frame.imageUrl,
      status: frame.status
    }
  });
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
