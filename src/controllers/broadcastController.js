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

const updateDeviceTelemetry = async (device, body) => {
  const data = {
    firmwareVersion: body.firmwareVersion || device.firmwareVersion || "",
    status: device.status === "new" ? "active" : device.status,
    lastSeenAt: new Date(),
    lastBatteryMv: numberOrNull(body.batteryMv),
    lastRssi: numberOrNull(body.rssi)
  };

  Object.assign(device, data);
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
  const session = await BroadcastSession.findOne({ pairing: req.params.pairingId }).sort({ createdAt: -1 }).lean();
  const frames = session ? await Frame.find({ broadcast: session._id }).sort({ deviceSeq: 1 }).lean() : [];
  res.json({ success: true, data: { session, frames } });
};

const listBroadcastFrames = async (req, res) => {
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
