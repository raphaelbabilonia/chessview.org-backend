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

  // Sets up a live broadcast and returns the ids/helpers the contract tests need.
  const liveBroadcast = async () => {
    const deviceId = uniqueDeviceId();
    const created = await client.json("POST", "/api/devices", { deviceId, name: "Contract Clock" }, token);
    const deviceSecret = created.body.data.deviceSecret;

    const bundle = await openCuneoBundle(client);
    const pairing = bundle.pairings.find((p) => p.result === "pending");
    const start = await client.json(
      "POST",
      `/api/pairings/${pairing._id}/broadcast/start`,
      { deviceId, orientation: "whiteBottom" },
      token
    );
    const broadcastId = start.body.data._id;

    const deviceHeaders = { "X-Device-Id": deviceId, "X-Device-Secret": deviceSecret };
    const uploadFrame = async (fields, headers = deviceHeaders, blob = jpegBytes) => {
      const form = new FormData();
      for (const [key, value] of Object.entries(fields)) form.append(key, String(value));
      form.append("image", new Blob([blob], { type: "image/jpeg" }), "frame.jpg");
      const res = await fetch(`${ctx.base}/api/device/frames`, { method: "POST", headers, body: form });
      const body = await res.json();
      trackUploaded(body.data && body.data.imageUrl);
      return { status: res.status, body };
    };

    return { deviceId, deviceSecret, deviceHeaders, pairing, broadcastId, uploadFrame };
  };

  describe("contract: heartbeat", () => {
    it("stores extended telemetry and returns the trimmed contract shape", async () => {
      const deviceId = uniqueDeviceId();
      const created = await client.json("POST", "/api/devices", { deviceId, name: "HB" }, token);
      const beat = await client.request("/api/device/heartbeat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Device-Id": deviceId,
          "X-Device-Secret": created.body.data.deviceSecret
        },
        body: JSON.stringify({
          firmwareVersion: "cv-clock-cam-v1.0.0",
          batteryMv: 3860,
          batteryPercent: 72,
          charging: false,
          rssi: -55,
          clockState: "idle",
          queuedEvents: 0,
          freeStorageBytes: 1515520
        })
      });
      assert.equal(beat.status, 200);
      // Response is exactly the documented device-facing shape.
      assert.deepEqual(Object.keys(beat.body.data).sort(), [
        "deviceId",
        "lastBatteryMv",
        "lastRssi",
        "lastSeenAt",
        "status"
      ]);
      assert.equal(beat.body.data.lastBatteryMv, 3860);
      assert.equal(beat.body.data.lastRssi, -55);

      // The extended telemetry is persisted (visible on the manage list).
      const devices = await client.json("GET", "/api/devices", undefined, token);
      const stored = devices.body.data.find((d) => d.deviceId === deviceId);
      assert.equal(stored.lastBatteryPercent, 72);
      assert.equal(stored.lastCharging, false);
      assert.equal(stored.lastClockState, "idle");
      assert.equal(stored.lastQueuedEvents, 0);
      assert.equal(stored.lastFreeStorageBytes, 1515520);
    });

    it("400s a heartbeat missing the required firmwareVersion/batteryMv", async () => {
      const deviceId = uniqueDeviceId();
      const created = await client.json("POST", "/api/devices", { deviceId, name: "HB2" }, token);
      const beat = await client.request("/api/device/heartbeat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Device-Id": deviceId,
          "X-Device-Secret": created.body.data.deviceSecret
        },
        body: JSON.stringify({ rssi: -50 })
      });
      assert.equal(beat.status, 400);
    });
  });

  describe("contract: move frame", () => {
    it("persists v1 move/time metadata and echoes imageClientId + deduplicated", async () => {
      const { broadcastId, pairing, uploadFrame } = await liveBroadcast();
      const res = await uploadFrame({
        broadcastId,
        pairingId: pairing._id,
        deviceSeq: 42,
        imageClientId: "cv-clock-000042",
        ply: 41,
        moveNumber: 21,
        sideJustMoved: "white",
        sideToMove: "black",
        pressedAt: "2026-06-26T10:18:14.250Z",
        capturedAt: "2026-06-26T10:18:14.900Z",
        whiteRemainingMs: 1785000,
        blackRemainingMs: 1712000,
        moveDurationMs: 38000,
        clockStateAfterPress: "running",
        imageWidth: 640,
        imageHeight: 480,
        jpegSha256: "abc123",
        batteryMv: 3820,
        rssi: -57
      });
      assert.equal(res.status, 201);
      assert.equal(res.body.data.deduplicated, false);
      assert.equal(res.body.data.imageClientId, "cv-clock-000042");

      // Full metadata survived onto the stored frame.
      const frames = await client.request(`/api/broadcasts/${broadcastId}/frames`);
      const frame = frames.body.data[0];
      assert.equal(frame.pairing, pairing._id);
      assert.equal(frame.ply, 41);
      assert.equal(frame.moveNumber, 21);
      assert.equal(frame.sideJustMoved, "white");
      assert.equal(frame.sideToMove, "black");
      assert.equal(frame.whiteRemainingMs, 1785000);
      assert.equal(frame.moveDurationMs, 38000);
      assert.equal(frame.clockStateAfterPress, "running");
      assert.equal(frame.width, 640);
      assert.equal(frame.jpegSha256, "abc123");
      assert.deepEqual(frame.anomalies, []);
    });

    it("is idempotent on imageClientId even when deviceSeq differs", async () => {
      const { broadcastId, uploadFrame } = await liveBroadcast();
      const first = await uploadFrame({
        broadcastId,
        deviceSeq: 5,
        imageClientId: "cv-clock-000005",
        capturedAt: "2026-06-26T10:00:00Z"
      });
      assert.equal(first.status, 201);
      const retry = await uploadFrame({
        broadcastId,
        deviceSeq: 6, // a retry that (wrongly) advanced the seq but kept the client id
        imageClientId: "cv-clock-000005",
        capturedAt: "2026-06-26T10:00:00Z"
      });
      assert.equal(retry.status, 200);
      assert.equal(retry.body.data.deduplicated, true);
      assert.equal(retry.body.data.frameId, first.body.data.frameId);

      const frames = await client.request(`/api/broadcasts/${broadcastId}/frames`);
      assert.equal(frames.body.data.length, 1, "no duplicate created");
    });

    it("409s when pairingId does not match the broadcast", async () => {
      const { broadcastId, uploadFrame } = await liveBroadcast();
      const res = await uploadFrame({
        broadcastId,
        pairingId: "665f00000000000000000009", // a valid ObjectId, but not this broadcast's
        deviceSeq: 1,
        capturedAt: "2026-06-26T10:00:00Z"
      });
      assert.equal(res.status, 409);
    });

    it("403s a device that is not assigned to the broadcast", async () => {
      const { broadcastId } = await liveBroadcast();
      // A second, valid device that was never assigned to this broadcast.
      const otherId = uniqueDeviceId();
      const other = await client.json("POST", "/api/devices", { deviceId: otherId, name: "Other" }, token);
      const form = new FormData();
      form.append("broadcastId", broadcastId);
      form.append("deviceSeq", "1");
      form.append("capturedAt", "2026-06-26T10:00:00Z");
      form.append("image", new Blob([jpegBytes], { type: "image/jpeg" }), "frame.jpg");
      const res = await fetch(`${ctx.base}/api/device/frames`, {
        method: "POST",
        headers: { "X-Device-Id": otherId, "X-Device-Secret": other.body.data.deviceSecret },
        body: form
      });
      assert.equal(res.status, 403);
    });

    it("415s a non-JPEG upload", async () => {
      const { deviceHeaders, broadcastId } = await liveBroadcast();
      const form = new FormData();
      form.append("broadcastId", broadcastId);
      form.append("deviceSeq", "1");
      form.append("image", new Blob([Buffer.from("not a jpeg")], { type: "image/png" }), "frame.png");
      const res = await fetch(`${ctx.base}/api/device/frames`, {
        method: "POST",
        headers: deviceHeaders,
        body: form
      });
      assert.equal(res.status, 415);
    });

    it("415s spoofed JPEG content even when the MIME type claims image/jpeg", async () => {
      const { deviceHeaders, broadcastId } = await liveBroadcast();
      const form = new FormData();
      form.append("broadcastId", broadcastId);
      form.append("deviceSeq", "1");
      form.append("image", new Blob([Buffer.from("<html>not an image</html>")], { type: "image/jpeg" }), "frame.jpg");
      const res = await fetch(`${ctx.base}/api/device/frames`, {
        method: "POST",
        headers: deviceHeaders,
        body: form
      });
      assert.equal(res.status, 415);
    });

    it("413s a JPEG over the 2MB limit", async () => {
      const { deviceHeaders, broadcastId } = await liveBroadcast();
      const bigJpeg = Buffer.alloc(2 * 1024 * 1024 + 1, 0xff);
      const form = new FormData();
      form.append("broadcastId", broadcastId);
      form.append("deviceSeq", "1");
      form.append("image", new Blob([bigJpeg], { type: "image/jpeg" }), "big.jpg");
      const res = await fetch(`${ctx.base}/api/device/frames`, {
        method: "POST",
        headers: deviceHeaders,
        body: form
      });
      assert.equal(res.status, 413);
    });

    it("flags incoherent metadata as anomalies instead of rejecting it", async () => {
      const { broadcastId, uploadFrame } = await liveBroadcast();
      const res = await uploadFrame({
        broadcastId,
        deviceSeq: 7,
        capturedAt: "2026-06-26T10:00:00Z",
        ply: 2, // even ply => black just moved, but the device claims white
        sideJustMoved: "white",
        whiteRemainingMs: -100
      });
      assert.equal(res.status, 201);
      const frames = await client.request(`/api/broadcasts/${broadcastId}/frames`);
      const frame = frames.body.data.find((f) => f.deviceSeq === 7);
      assert.ok(frame.anomalies.includes("ply-side-mismatch"));
      assert.ok(frame.anomalies.includes("negative-white-clock"));
    });
  });
});
