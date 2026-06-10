const express = require("express");
const fs = require("fs");
const multer = require("multer");
const path = require("path");
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
const requireRole = require("../middleware/roleMiddleware");

fs.mkdirSync(uploadRoot, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadRoot),
  filename: (req, file, cb) => {
    const safeBase = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${safeBase}${path.extname(file.originalname || ".jpg") || ".jpg"}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== "image/jpeg") {
      return cb(new Error("Only JPEG images are accepted"));
    }
    cb(null, true);
  }
});

const router = express.Router();
const manageRoles = [authMiddleware, requireRole("organizer", "admin")];

router.post("/devices", ...manageRoles, createDevice);
router.get("/devices", ...manageRoles, listDevices);
router.patch("/devices/:deviceId", ...manageRoles, updateDevice);

router.post("/pairings/:pairingId/broadcast/start", ...manageRoles, startBroadcast);
router.post("/broadcasts/:broadcastId/end", ...manageRoles, endBroadcast);
router.get("/pairings/:pairingId/broadcast", getPairingBroadcast);
router.get("/broadcasts/:broadcastId/frames", listBroadcastFrames);

router.post("/device/heartbeat", deviceHeartbeat);
router.post("/device/frames", upload.single("image"), deviceFrameUpload);

module.exports = router;
