const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const multer = require("multer");
const {
  createDevice,
  deviceFrameUpload,
  deviceHeartbeat,
  endBroadcast,
  getPairingBroadcast,
  listBroadcastFrames,
  listDevices,
  startBroadcast,
  updateDevice,
  uploadRoot
} = require("../controllers/broadcastController");
const authMiddleware = require("../middleware/authMiddleware");
const optionalAuthMiddleware = require("../middleware/optionalAuthMiddleware");
const requireRole = require("../middleware/roleMiddleware");
const validate = require("../middleware/validate");
const validateObjectId = require("../middleware/validateObjectId");
const {
  createDeviceSchema,
  updateDeviceSchema,
  startBroadcastSchema
} = require("../validation/deviceSchemas");

fs.mkdirSync(uploadRoot, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadRoot),
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${crypto.randomUUID()}.jpg`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== "image/jpeg") {
      const err = new Error("Only JPEG images are accepted");
      err.code = "UNSUPPORTED_MEDIA_TYPE";
      return cb(err);
    }
    cb(null, true);
  }
});

// Runs multer for the frame upload and translates its rejections into the
// contract's HTTP codes: 413 for an oversized JPEG, 415 for a non-JPEG. Anything
// else falls through to the shared error middleware.
const uploadFrame = (req, res, next) => {
  upload.single("image")(req, res, async (err) => {
    if (err?.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ success: false, message: "JPEG exceeds the 2MB limit" });
    }
    if (err?.code === "UNSUPPORTED_MEDIA_TYPE") {
      return res.status(415).json({ success: false, message: err.message });
    }
    if (err) return next(err);
    if (!req.file) return next();

    try {
      const handle = await fs.promises.open(req.file.path, "r");
      const signature = Buffer.alloc(3);
      try {
        await handle.read(signature, 0, signature.length, 0);
      } finally {
        await handle.close();
      }
      const isJpeg = signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff;
      if (!isJpeg) {
        await fs.promises.unlink(req.file.path).catch(() => {});
        req.file = undefined;
        return res.status(415).json({ success: false, message: "Only valid JPEG images are accepted" });
      }
      return next();
    } catch (error) {
      await fs.promises.unlink(req.file.path).catch(() => {});
      req.file = undefined;
      return next(error);
    }
  });
};

const router = express.Router();
const manageRoles = [authMiddleware, requireRole("organizer", "admin")];

router.post("/devices", ...manageRoles, validate(createDeviceSchema), createDevice);
router.get("/devices", ...manageRoles, listDevices);
router.patch("/devices/:deviceId", ...manageRoles, validate(updateDeviceSchema), updateDevice);

router.post("/pairings/:pairingId/broadcast/start", ...manageRoles, validateObjectId("pairingId"), validate(startBroadcastSchema), startBroadcast);
router.post("/broadcasts/:broadcastId/end", ...manageRoles, validateObjectId("broadcastId"), endBroadcast);
router.get("/pairings/:pairingId/broadcast", optionalAuthMiddleware, validateObjectId("pairingId"), getPairingBroadcast);
router.get("/broadcasts/:broadcastId/frames", optionalAuthMiddleware, validateObjectId("broadcastId"), listBroadcastFrames);

router.post("/device/heartbeat", deviceHeartbeat);
router.post("/device/frames", uploadFrame, deviceFrameUpload);

module.exports = router;
