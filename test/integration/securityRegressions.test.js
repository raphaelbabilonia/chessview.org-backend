// Each test here reproduces a hole found by the November 2026 security audit.
const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const fs = require("node:fs");
const {
  startTestServer,
  stopTestServer,
  reseed,
  makeClient,
  login,
  openCuneoBundle
} = require("../../test-helpers/server");
const { uploadRoot } = require("../../src/controllers/broadcastController");
const Device = require("../../src/models/Device");
const Event = require("../../src/models/Event");
const NewsItem = require("../../src/models/NewsItem");
const Player = require("../../src/models/Player");
const User = require("../../src/models/User");

const agentToken = "security-regression-agent-token";
const rivalEmail = "rival-organizer@chessview.local";
const rivalPassword = "rival-organizer-password";

const frameRequest = (base, headers, parts = {}) => {
  const form = new FormData();
  for (const [key, value] of Object.entries(parts)) form.append(key, String(value));
  form.append("image", new Blob([Buffer.from("<html>not a jpeg</html>")], { type: "text/html" }), "page.html");
  return fetch(`${base}/api/device/frames`, { method: "POST", headers, body: form });
};

describe("security regressions", () => {
  let ctx, client, organizerToken, adminToken, rivalToken, rival;

  const ingest = (path, items) =>
    client.request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Agent-Publish-Token": agentToken },
      body: JSON.stringify({ items })
    });

  before(async () => {
    process.env.AGENT_PUBLISH_TOKEN = agentToken;
    process.env.AGENT_PUBLISH_USER_EMAIL = "admin@chessview.local";
    ctx = await startTestServer();
    client = makeClient(ctx.base);
  });
  after(() => stopTestServer(ctx));
  beforeEach(async () => {
    await reseed();
    await Device.deleteMany({});
    rival = await User.create({
      name: "Rival Organizer",
      email: rivalEmail,
      passwordHash: await bcrypt.hash(rivalPassword, 4),
      role: "organizer"
    });
    organizerToken = await login(ctx.base);
    adminToken = await login(ctx.base, "admin@chessview.local");
    rivalToken = await login(ctx.base, rivalEmail, rivalPassword);
  });

  describe("device uploads", () => {
    it("rejects bad credentials before it reads the upload", async () => {
      const filesBefore = fs.readdirSync(uploadRoot).length;

      const unknown = await frameRequest(ctx.base, { "X-Device-Id": "nobody", "X-Device-Secret": "nothing" });
      assert.equal(unknown.status, 401, "a non-JPEG body from a stranger must never reach the upload parser");

      const missing = await frameRequest(ctx.base, {});
      assert.equal(missing.status, 401);

      assert.equal(fs.readdirSync(uploadRoot).length, filesBefore);
    });

    it("still checks the file type for a real device", async () => {
      const created = await client.json("POST", "/api/devices", { name: "Clock" }, organizerToken);
      const res = await frameRequest(ctx.base, {
        "X-Device-Id": created.body.data.deviceId,
        "X-Device-Secret": created.body.data.deviceSecret
      });
      assert.equal(res.status, 415);
    });

    it("refuses a form with far more fields than a frame carries", async () => {
      const created = await client.json("POST", "/api/devices", { name: "Clock" }, organizerToken);
      const parts = Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`field${index}`, "x"]));
      const res = await frameRequest(
        ctx.base,
        { "X-Device-Id": created.body.data.deviceId, "X-Device-Secret": created.body.data.deviceSecret },
        parts
      );
      assert.equal(res.status, 400);
    });

    it("refuses a guessable device secret", async () => {
      const res = await client.json("POST", "/api/devices", { name: "Clock", deviceSecret: "1234" }, organizerToken);
      assert.equal(res.status, 422);
    });
  });

  describe("device ownership", () => {
    let deviceId;

    beforeEach(async () => {
      const created = await client.json("POST", "/api/devices", { name: "Organizer clock" }, organizerToken);
      deviceId = created.body.data.deviceId;
    });

    it("hides another organizer's devices", async () => {
      const mine = await client.request("/api/devices", { headers: { Authorization: `Bearer ${organizerToken}` } });
      const theirs = await client.request("/api/devices", { headers: { Authorization: `Bearer ${rivalToken}` } });
      assert.equal(mine.body.data.length, 1);
      assert.equal(theirs.body.data.length, 0);
    });

    it("stops another organizer changing or disabling a device", async () => {
      const res = await client.json("PATCH", `/api/devices/${deviceId}`, { status: "disabled" }, rivalToken);
      assert.equal(res.status, 404);
      assert.equal((await Device.findOne({ deviceId }).lean()).status, "new");
    });

    it("stops another organizer broadcasting from a device", async () => {
      const bundle = await openCuneoBundle(client);
      const pairing = bundle.pairings.find((item) => item.result === "pending");
      await Event.updateOne({ _id: bundle._id }, { organizer: rival._id });

      const res = await client.json("POST", `/api/pairings/${pairing._id}/broadcast/start`, { deviceId }, rivalToken);
      assert.equal(res.status, 404);
    });

    it("leaves devices without an owner to admins", async () => {
      await Device.updateOne({ deviceId }, { owner: null });

      const organizer = await client.request("/api/devices", { headers: { Authorization: `Bearer ${organizerToken}` } });
      const admin = await client.request("/api/devices", { headers: { Authorization: `Bearer ${adminToken}` } });
      assert.equal(organizer.body.data.length, 0);
      assert.equal(admin.body.data.length, 1);

      const updated = await client.json("PATCH", `/api/devices/${deviceId}`, { name: "Renamed" }, adminToken);
      assert.equal(updated.status, 200);
    });
  });

  describe("pairings", () => {
    it("only accepts players from the round's own section", async () => {
      const bundle = await openCuneoBundle(client);
      const round = bundle.rounds[0];
      const white = bundle.players.find((player) => String(player.section) === String(round.section));
      const foreignEvent = await Event.findOne({ slug: { $ne: bundle.slug } }).lean();
      const foreign = await Player.create({
        event: foreignEvent._id,
        section: bundle.sections[0]._id,
        firstName: "Foreign",
        lastName: "Player"
      });

      const res = await client.json(
        "POST",
        `/api/rounds/${round._id}/pairings`,
        { boardNumber: 99, whitePlayer: white._id, blackPlayer: foreign._id },
        organizerToken
      );
      assert.equal(res.status, 404);
    });

    it("does not reveal whether a player exists to someone who cannot manage the event", async () => {
      const bundle = await openCuneoBundle(client);
      const res = await client.json(
        "POST",
        `/api/rounds/${bundle.rounds[0]._id}/pairings`,
        { boardNumber: 99, whitePlayer: "507f1f77bcf86cd799439011" },
        rivalToken
      );
      assert.equal(res.status, 403);
    });
  });

  describe("event links", () => {
    const newEvent = {
      title: "Link Safety Open",
      city: "Torino",
      startDate: "2030-01-01T09:00:00.000Z",
      endDate: "2030-01-02T18:00:00.000Z"
    };

    it("refuses links that are not web links from organizers", async () => {
      for (const url of ["javascript:alert(document.domain)", " JaVaScRiPt:alert(1)", "data:text/html,x", "not a url"]) {
        const res = await client.json("POST", "/api/events", { ...newEvent, websiteUrl: url }, organizerToken);
        assert.equal(res.status, 422, url);
      }
      const patched = await client.json(
        "PATCH",
        `/api/events/${(await Event.findOne({ slug: "chess-view-open-cuneo" }))._id}`,
        { resultsUrl: "javascript:alert(1)" },
        organizerToken
      );
      assert.equal(patched.status, 422);
    });

    it("keeps normal links and allows clearing one", async () => {
      const res = await client.json(
        "POST",
        "/api/events",
        { ...newEvent, websiteUrl: "https://example.org/open", resultsUrl: "" },
        organizerToken
      );
      assert.equal(res.status, 201);
      assert.equal(res.body.data.websiteUrl, "https://example.org/open");
    });

    it("never publishes a bad link already in the database", async () => {
      const wrapped = "chrome-extension://abcdef/https://example.org/rules.pdf";
      await Event.updateOne(
        { slug: "chess-view-open-cuneo" },
        {
          websiteUrl: wrapped,
          resultsUrl: "javascript:alert(1)",
          "source.url": "data:text/html,x",
          externalLinks: [
            { label: "Bad", type: "website", url: wrapped },
            { label: "Good", type: "website", url: "https://example.org/good" }
          ]
        }
      );

      const detail = await openCuneoBundle(client);
      assert.equal(detail.websiteUrl, "");
      assert.equal(detail.resultsUrl, "");
      assert.equal(detail.source.url, "");
      assert.deepEqual(detail.externalLinks.map((link) => link.url), ["https://example.org/good"]);

      const list = await client.request("/api/events?includePast=true&limit=100");
      const item = list.body.data.find((event) => event.slug === "chess-view-open-cuneo");
      assert.equal(item.websiteUrl, "");
      assert.deepEqual(item.externalLinks.map((link) => link.url), ["https://example.org/good"]);
    });
  });

  describe("private ingest", () => {
    const tournament = {
      schemaVersion: 1,
      title: "Link Safety Ingest Open",
      startDate: "2030-03-10",
      endDate: "2030-03-12",
      country: "Italy",
      city: "Milano",
      sourceName: "Agent Source",
      sourceUrl: "https://example.org/events/link-safety",
      confidence: 0.95,
      publishStatus: "ready"
    };
    const news = {
      title: "Link Safety Story",
      summary: "A short summary of a chess story.",
      sourceName: "Agent Source",
      sourceUrl: "https://example.org/news/link-safety",
      canonicalUrl: "https://example.org/news/link-safety",
      imageUrl: "https://example.org/news/link-safety.jpg",
      publishedAt: "2030-03-01T10:00:00.000Z",
      confidence: 0.9,
      publishStatus: "ready"
    };

    it("drops bad tournament links and keeps the good ones", async () => {
      const res = await ingest("/api/agent-ingest/tournaments", [
        {
          ...tournament,
          websiteUrl: "chrome-extension://abcdef/https://example.org/rules.pdf",
          resultsUrl: "javascript:alert(1)",
          regulationsUrl: "https://example.org/rules",
          externalLinks: [
            { label: "Bad", url: "javascript:alert(1)" },
            { label: "Good", url: "https://example.org/good" }
          ]
        }
      ]);
      assert.equal(res.status, 200);
      assert.equal(res.body.meta.created, 1);

      const event = await Event.findOne({ title: tournament.title }).lean();
      assert.equal(event.websiteUrl, tournament.sourceUrl);
      assert.equal(event.resultsUrl, "");
      assert.equal(event.regulationsUrl, "https://example.org/rules");
      assert.ok(event.externalLinks.every((link) => /^https:/.test(link.url)));
      assert.ok(event.externalLinks.some((link) => link.url === "https://example.org/good"));
    });

    it("rejects a tournament whose source is not a web link", async () => {
      const res = await ingest("/api/agent-ingest/tournaments", [{ ...tournament, sourceUrl: "javascript:alert(1)" }]);
      assert.equal(res.body.meta.created, 0);
      assert.equal(res.body.meta.rejected, 1);
    });

    it("rejects news that points anywhere but the web and cleans its related links", async () => {
      const bad = await ingest("/api/agent-ingest/news", [
        { ...news, sourceUrl: "javascript:alert(1)", canonicalUrl: "javascript:alert(1)" }
      ]);
      assert.equal(bad.body.meta.created, 0);
      assert.equal(bad.body.meta.rejected, 1);

      const good = await ingest("/api/agent-ingest/news", [
        {
          ...news,
          sourceHomeUrl: "javascript:alert(1)",
          relatedCoverage: [
            { sourceName: "Bad", url: "javascript:alert(1)" },
            { sourceName: "Good", url: "https://example.org/more" }
          ]
        }
      ]);
      assert.equal(good.body.meta.created, 1);
      const stored = await NewsItem.findOne({ title: news.title }).lean();
      assert.equal(stored.sourceHomeUrl, "https://example.org");
      assert.deepEqual(stored.relatedCoverage.map((entry) => entry.url), ["https://example.org/more"]);
    });
  });
});
