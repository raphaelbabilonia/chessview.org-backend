const { z } = require("zod");
const { nonEmpty, objectId } = require("./common");

const sideEnum = z.enum(["white", "black", "unknown"]);

// `secretHash`/`status` are not accepted on create; deviceId/secret default if omitted.
const createDeviceSchema = z.object({
  deviceId: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).optional(),
  deviceSecret: z.string().min(1).optional(),
  firmwareVersion: z.string().optional(),
  notes: z.string().optional()
});

const updateDeviceSchema = nonEmpty(
  z
    .object({
      name: z.string().trim().min(1),
      notes: z.string(),
      status: z.enum(["new", "active", "disabled"])
    })
    .partial()
);

const startBroadcastSchema = z.object({
  deviceId: z.string().trim().min(1),
  orientation: z.enum(["whiteBottom", "blackBottom", "unknown"]).optional(),
  calibration: z.unknown().optional()
});

// POST /api/device/heartbeat — JSON body (numbers arrive as real numbers).
// Parsed *inside* the controller, after device-header auth, so it returns the
// contract's 400 rather than the validate() middleware's 422.
const heartbeatSchema = z.object({
  firmwareVersion: z.string().trim().min(1),
  batteryMv: z.coerce.number(),
  batteryPercent: z.coerce.number().min(0).max(100).optional(),
  charging: z.boolean().optional(),
  rssi: z.coerce.number().optional(),
  clockState: z.enum(["idle", "setup", "live", "paused", "ended", "error"]).optional(),
  activeBroadcastId: z.string().optional(),
  queuedEvents: z.coerce.number().int().min(0).optional(),
  freeStorageBytes: z.coerce.number().int().min(0).optional()
});

// POST /api/device/frames — multipart/form-data (every value arrives as a
// string, hence z.coerce for the numeric fields). The JPEG itself is handled by
// multer; this validates the accompanying metadata. Parsed inside the controller
// so a rejection can clean up the already-written upload before responding 400.
const frameUploadSchema = z.object({
  broadcastId: objectId,
  pairingId: objectId.optional(),
  deviceSeq: z.coerce.number().int().positive(),
  imageClientId: z.string().trim().min(1).optional(),
  capturedAt: z.string().trim().min(1).optional(),
  imageCapturedAt: z.string().trim().min(1).optional(),
  pressedAt: z.string().trim().min(1).optional(),
  ply: z.coerce.number().int().positive().optional(),
  moveNumber: z.coerce.number().int().positive().optional(),
  sideJustMoved: sideEnum.optional(),
  sideToMove: sideEnum.optional(),
  whiteRemainingMs: z.coerce.number().int().optional(),
  blackRemainingMs: z.coerce.number().int().optional(),
  moveDurationMs: z.coerce.number().int().optional(),
  clockStateAfterPress: z.enum(["running", "paused", "flagged", "ended", "unknown"]).optional(),
  jpegSha256: z.string().trim().min(1).optional(),
  imageWidth: z.coerce.number().int().positive().optional(),
  imageHeight: z.coerce.number().int().positive().optional(),
  batteryMv: z.coerce.number().optional(),
  rssi: z.coerce.number().optional(),
  firmwareVersion: z.string().optional()
});

module.exports = {
  createDeviceSchema,
  updateDeviceSchema,
  startBroadcastSchema,
  heartbeatSchema,
  frameUploadSchema
};
