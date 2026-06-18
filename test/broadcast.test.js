// End-to-end test of the device → broadcast → frame-upload pipeline, running
// against a real but ephemeral MongoDB (mongodb-memory-server). No external
// database or MEMORY_STORE flag required.
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-test-secret-test-secret";
process.env.NODE_ENV = "test";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { connectDB } = require("../src/config/db");
const seedDatabase = require("../src/utils/seedDatabase");
const Pairing = require("../src/models/Pairing");

// A minimal valid 1x1 JPEG (matches the multer image/jpeg fileFilter).
const jpegBytes = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/ASP/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/ASP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Ar//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z",
  "base64"
);

let mongod;
let server;
let base;

const api = async (path, options = {}) => {
  const res = await fetch(`${base}${path}`, options);
  const body = await res.json();
  return { status: res.status, body };
};

before(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  await connectDB();
  await seedDatabase();
  // require app AFTER the connection is up; it builds the router at import time.
  const app = require("../src/app");
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

test("device pairing → broadcast → idempotent frame upload", async () => {
  // 1. Organizer login (seeded account)
  const login = await api("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "organizer@chessview.local", password: "password123" })
  });
  assert.equal(login.status, 200, "login should succeed");
  const token = login.body.data.token;
  assert.ok(token, "login returns a token");

  // 2. Register a device, capture the one-time secret
  const deviceId = `cv-clock-test-${Date.now()}`;
  const created = await api("/api/devices", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ deviceId, name: "Test Clock" })
  });
  assert.equal(created.status, 201, "device create");
  const deviceSecret = created.body.data.deviceSecret;
  assert.ok(deviceSecret, "device secret returned once");
  assert.equal("secretHash" in created.body.data, false, "secretHash never leaks");

  // 3. A seeded pairing to broadcast (the open-cuneo pending board)
  const pairing = await Pairing.findOne({ result: "pending" }).lean();
  assert.ok(pairing, "a pending pairing was seeded");

  const start = await api(`/api/pairings/${pairing._id}/broadcast/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ deviceId, orientation: "whiteBottom" })
  });
  assert.ok([200, 201].includes(start.status), "broadcast start");
  const broadcastId = start.body.data._id;
  assert.equal(start.body.data.status, "live", "broadcast is live");

  // 4. Device heartbeat (device-header auth, no JWT)
  const beat = await api("/api/device/heartbeat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Device-Id": deviceId,
      "X-Device-Secret": deviceSecret
    },
    body: JSON.stringify({ firmwareVersion: "cv-cam-v0.1.0", batteryMv: 3700, rssi: -55 })
  });
  assert.equal(beat.status, 200, "heartbeat");
  assert.equal(beat.body.data.status, "active", "device promoted new -> active");

  // 5. Upload a frame
  const uploadFrame = async (seq) => {
    const form = new FormData();
    form.append("broadcastId", broadcastId);
    form.append("deviceSeq", String(seq));
    form.append("capturedAt", "2026-06-05T10:00:00Z");
    form.append("image", new Blob([jpegBytes], { type: "image/jpeg" }), `frame-${seq}.jpg`);
    const res = await fetch(`${base}/api/device/frames`, {
      method: "POST",
      headers: { "X-Device-Id": deviceId, "X-Device-Secret": deviceSecret },
      body: form
    });
    return { status: res.status, body: await res.json() };
  };

  const first = await uploadFrame(1);
  assert.equal(first.status, 201, "first frame upload creates (201)");
  const frameId = first.body.data.frameId;

  // 6. Re-upload the SAME deviceSeq -> idempotent: 200 + same frame
  const retry = await uploadFrame(1);
  assert.equal(retry.status, 200, "duplicate deviceSeq is idempotent (200)");
  assert.equal(retry.body.data.frameId, frameId, "duplicate returns the original frame");

  // 7. Exactly one frame stored
  const frames = await api(`/api/broadcasts/${broadcastId}/frames`);
  assert.equal(frames.status, 200, "list frames");
  assert.equal(frames.body.data.length, 1, "duplicate retry did not create a second frame");
});
