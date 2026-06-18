const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  startTestServer,
  stopTestServer,
  reseed,
  makeClient,
  login,
  openCuneoBundle
} = require("../../test-helpers/server");
const { uploadRoot } = require("../../src/controllers/broadcastController");

// A minimal valid 1x1 JPEG (matches the multer image/jpeg fileFilter).
const jpegBytes = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/ASP/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/ASP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Ar//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z",
  "base64"
);

const uniqueDeviceId = () => `cv-clock-test-${Date.now()}-${Math.round(Math.random() * 1e6)}`;

describe("broadcastController", () => {
  let ctx, client, token;
  // On-disk frame files written by the upload test (multer disk storage), removed
  // in after() so the suite doesn't leave artifacts in uploads/broadcast/.
  const createdFiles = [];
  const trackUploaded = (imageUrl) => {
    if (imageUrl) createdFiles.push(path.join(uploadRoot, path.basename(imageUrl)));
  };

  before(async () => {
    ctx = await startTestServer();
    client = makeClient(ctx.base);
  });
  after(async () => {
    await Promise.all(createdFiles.map((file) => fs.promises.rm(file, { force: true })));
    await stopTestServer(ctx);
  });
  beforeEach(async () => {
    await reseed();
    token = await login(ctx.base);
  });

  describe("POST /api/devices", () => {
    it("registers a device, returns the one-time secret, and never leaks secretHash", async () => {
      const created = await client.json("POST", "/api/devices", { deviceId: uniqueDeviceId(), name: "Clock" }, token);
      assert.equal(created.status, 201);
      assert.ok(created.body.data.deviceSecret, "secret returned once");
      assert.equal("secretHash" in created.body.data, false, "secretHash never leaks");
    });

    it("409s a duplicate deviceId", async () => {
      const deviceId = uniqueDeviceId();
      await client.json("POST", "/api/devices", { deviceId, name: "First" }, token);
      const dup = await client.json("POST", "/api/devices", { deviceId, name: "Second" }, token);
      assert.equal(dup.status, 409);
    });

    it("403s a player (role gate)", async () => {
      const playerToken = await login(ctx.base, "player@chessview.local");
      const res = await client.json("POST", "/api/devices", { name: "Nope" }, playerToken);
      assert.equal(res.status, 403);
    });
  });

  describe("device → broadcast → frame pipeline", () => {
    it("pairs a device, starts a broadcast, heartbeats, and uploads frames idempotently", async () => {
      // 1. Register a device, capture the one-time secret.
      const deviceId = uniqueDeviceId();
      const created = await client.json("POST", "/api/devices", { deviceId, name: "Test Clock" }, token);
      assert.equal(created.status, 201);
      const deviceSecret = created.body.data.deviceSecret;

      // 2. A seeded pending pairing to broadcast (the open-cuneo board).
      const bundle = await openCuneoBundle(client);
      const pairing = bundle.pairings.find((p) => p.result === "pending");
      assert.ok(pairing, "a pending pairing was seeded");

      const start = await client.json(
        "POST",
        `/api/pairings/${pairing._id}/broadcast/start`,
        { deviceId, orientation: "whiteBottom" },
        token
      );
      assert.ok([200, 201].includes(start.status), "broadcast start");
      const broadcastId = start.body.data._id;
      assert.equal(start.body.data.status, "live", "broadcast is live");

      // 3. Device heartbeat (device-header auth, no JWT).
      const beat = await client.request("/api/device/heartbeat", {
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

      // 4. Upload a frame (multipart).
      const uploadFrame = async (seq) => {
        const form = new FormData();
        form.append("broadcastId", broadcastId);
        form.append("deviceSeq", String(seq));
        form.append("capturedAt", "2026-06-05T10:00:00Z");
        form.append("image", new Blob([jpegBytes], { type: "image/jpeg" }), `frame-${seq}.jpg`);
        const res = await fetch(`${ctx.base}/api/device/frames`, {
          method: "POST",
          headers: { "X-Device-Id": deviceId, "X-Device-Secret": deviceSecret },
          body: form
        });
        return { status: res.status, body: await res.json() };
      };

      const first = await uploadFrame(1);
      assert.equal(first.status, 201, "first frame upload creates (201)");
      const frameId = first.body.data.frameId;
      trackUploaded(first.body.data.imageUrl); // kept on disk → clean up in after()

      // 5. Re-upload the SAME deviceSeq -> idempotent: 200 + same frame.
      const retry = await uploadFrame(1);
      assert.equal(retry.status, 200, "duplicate deviceSeq is idempotent (200)");
      assert.equal(retry.body.data.frameId, frameId, "duplicate returns the original frame");

      // 6. Exactly one frame stored.
      const frames = await client.request(`/api/broadcasts/${broadcastId}/frames`);
      assert.equal(frames.status, 200, "list frames");
      assert.equal(frames.body.data.length, 1, "duplicate retry did not create a second frame");
    });

    it("rejects an unknown device secret on heartbeat with 401", async () => {
      const res = await client.request("/api/device/heartbeat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Device-Id": "cv-clock-does-not-exist",
          "X-Device-Secret": "nope"
        },
        body: JSON.stringify({})
      });
      assert.equal(res.status, 401);
    });
  });
});
