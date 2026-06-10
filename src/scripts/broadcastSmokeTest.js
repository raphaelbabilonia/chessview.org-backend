process.env.MEMORY_STORE = "true";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const app = require("../app");
const { connectDB } = require("../config/db");
const { store } = require("../utils/memoryStore");

const jpegBytes = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/ASP/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/ASP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Ar//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z",
  "base64"
);

const parseJson = async (res) => ({
  status: res.status,
  body: await res.json()
});

const assertStatus = (result, expected, label) => {
  const allowed = Array.isArray(expected) ? expected : [expected];
  if (!allowed.includes(result.status)) {
    throw new Error(`${label} failed ${result.status}: ${JSON.stringify(result.body)}`);
  }
};

const main = async () => {
  await connectDB();
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    let result = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "organizer@chessview.local", password: "password123" })
    }).then(parseJson);
    assertStatus(result, 200, "login");
    const token = result.body.data.token;

    const deviceId = `cv-clock-smoke-${Date.now()}`;
    result = await fetch(`${base}/api/devices`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ deviceId, name: "Broadcast Smoke Test Clock" })
    }).then(parseJson);
    assertStatus(result, 201, "device create");
    const deviceSecret = result.body.data.deviceSecret;

    const pairingId = store.pairings[0]._id;
    result = await fetch(`${base}/api/pairings/${pairingId}/broadcast/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ deviceId, orientation: "whiteBottom" })
    }).then(parseJson);
    assertStatus(result, [200, 201], "broadcast start");
    const broadcastId = result.body.data._id;

    result = await fetch(`${base}/api/device/heartbeat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Device-Id": deviceId,
        "X-Device-Secret": deviceSecret
      },
      body: JSON.stringify({ firmwareVersion: "cv-cam-v0.1.0", batteryMv: 0, rssi: -42 })
    }).then(parseJson);
    assertStatus(result, 200, "heartbeat");

    const form = new FormData();
    form.append("broadcastId", broadcastId);
    form.append("deviceSeq", "1");
    form.append("capturedAt", "2026-06-05T10:00:00Z");
    form.append("batteryMv", "0");
    form.append("rssi", "-42");
    form.append("firmwareVersion", "cv-cam-v0.1.0");
    form.append("image", new Blob([jpegBytes], { type: "image/jpeg" }), "frame-1.jpg");
    result = await fetch(`${base}/api/device/frames`, {
      method: "POST",
      headers: { "X-Device-Id": deviceId, "X-Device-Secret": deviceSecret },
      body: form
    }).then(parseJson);
    assertStatus(result, 201, "frame upload");
    const frameId = result.body.data.frameId;

    const duplicate = new FormData();
    duplicate.append("broadcastId", broadcastId);
    duplicate.append("deviceSeq", "1");
    duplicate.append("capturedAt", "2026-06-05T10:00:01Z");
    duplicate.append("image", new Blob([jpegBytes], { type: "image/jpeg" }), "frame-1-duplicate.jpg");
    result = await fetch(`${base}/api/device/frames`, {
      method: "POST",
      headers: { "X-Device-Id": deviceId, "X-Device-Secret": deviceSecret },
      body: duplicate
    }).then(parseJson);
    assertStatus(result, 200, "duplicate upload");
    if (result.body.data.frameId !== frameId) {
      throw new Error("duplicate upload did not return the original frame");
    }

    result = await fetch(`${base}/api/broadcasts/${broadcastId}/frames`).then(parseJson);
    assertStatus(result, 200, "frame list");
    if (result.body.data.length !== 1) {
      throw new Error(`expected one frame after duplicate retry, got ${result.body.data.length}`);
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          pairingId,
          broadcastId,
          frameId,
          frameCount: result.body.data.length,
          imageUrl: result.body.data[0].imageUrl
        },
        null,
        2
      )
    );
  } finally {
    server.close();
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
