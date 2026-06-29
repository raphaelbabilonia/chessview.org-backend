const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { startTestServer, stopTestServer, reseed, makeClient, login } = require("../../test-helpers/server");
const Event = require("../../src/models/Event");

const daysFromNow = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

describe("eventController", () => {
  let ctx, client, token;

  before(async () => {
    ctx = await startTestServer();
    client = makeClient(ctx.base);
  });
  after(() => stopTestServer(ctx));
  beforeEach(async () => {
    await reseed();
    token = await login(ctx.base);
  });

  describe("GET /api/events", () => {
    it("lists only active public events to anonymous callers by default", async () => {
      await Event.updateOne(
        { slug: "chess-view-open-cuneo" },
        { startDate: daysFromNow(5), endDate: daysFromNow(6), status: "published", isPublic: true }
      );
      await Event.updateOne(
        { slug: "sunday-family-chess-festival" },
        { startDate: daysFromNow(-6), endDate: daysFromNow(-5), status: "completed", isPublic: true }
      );

      const res = await client.request("/api/events");
      assert.equal(res.status, 200);
      const slugs = res.body.data.map((e) => e.slug);
      assert.ok(slugs.includes("chess-view-open-cuneo"), "published+public shown");
      assert.ok(!slugs.includes("sunday-family-chess-festival"), "past public event hidden by default");
      assert.ok(!slugs.includes("junior-rapid-challenge"), "draft+private hidden");
      assert.ok("sectionsCount" in res.body.data[0], "list carries denormalized counts");
    });

    it("can include past public events when explicitly requested", async () => {
      await Event.updateOne(
        { slug: "sunday-family-chess-festival" },
        { startDate: daysFromNow(-6), endDate: daysFromNow(-5), status: "completed", isPublic: true }
      );

      const res = await client.request("/api/events?includePast=true");
      assert.equal(res.status, 200);
      const slugs = res.body.data.map((e) => e.slug);
      assert.ok(slugs.includes("sunday-family-chess-festival"), "explicit archive request shows past public event");
    });

    it("returns the organizer's own events (incl. drafts) with ?mine=true", async () => {
      const res = await client.request("/api/events?mine=true", {
        headers: { Authorization: `Bearer ${token}` }
      });
      assert.equal(res.status, 200);
      const slugs = res.body.data.map((e) => e.slug);
      assert.ok(slugs.includes("junior-rapid-challenge"), "owner sees their draft");
    });
  });

  describe("GET /api/events/:id", () => {
    it("resolves an event by slug and attaches the bundle", async () => {
      const res = await client.request("/api/events/chess-view-open-cuneo");
      assert.equal(res.status, 200);
      const ev = res.body.data;
      assert.ok(Array.isArray(ev.sections) && ev.sections.length === 2);
      assert.ok(Array.isArray(ev.players) && ev.players.length === 2);
      assert.ok(Array.isArray(ev.standings), "standings computed");
    });

    it("resolves the same event by id", async () => {
      const bySlug = await client.request("/api/events/chess-view-open-cuneo");
      const byId = await client.request(`/api/events/${bySlug.body.data._id}`);
      assert.equal(byId.status, 200);
      assert.equal(byId.body.data.slug, "chess-view-open-cuneo");
    });

    it("404s an unknown event", async () => {
      const res = await client.request("/api/events/no-such-event");
      assert.equal(res.status, 404);
    });

    it("403s a non-public event for anonymous callers, 200 for the owner", async () => {
      const anon = await client.request("/api/events/junior-rapid-challenge");
      assert.equal(anon.status, 403, "draft+private hidden from anonymous");

      const owner = await client.request("/api/events/junior-rapid-challenge", {
        headers: { Authorization: `Bearer ${token}` }
      });
      assert.equal(owner.status, 200, "owner can view their own draft");
    });
  });

  describe("POST /api/events", () => {
    it("403s a player (role gate)", async () => {
      const playerToken = await login(ctx.base, "player@chessview.local");
      const res = await client.json(
        "POST",
        "/api/events",
        { title: "T", city: "C", startDate: "2026-09-01T09:00:00.000Z", endDate: "2026-09-02T09:00:00.000Z" },
        playerToken
      );
      assert.equal(res.status, 403);
    });

    it("rejects an invalid payload with 422 + field errors", async () => {
      const res = await client.json("POST", "/api/events", { title: "" }, token);
      assert.equal(res.status, 422);
      assert.ok(res.body.errors.title);
      assert.ok(res.body.errors.city);
      assert.ok(res.body.errors.startDate);
    });

    it("rejects endDate before startDate with 422", async () => {
      const res = await client.json(
        "POST",
        "/api/events",
        {
          title: "Bad Dates",
          city: "Torino",
          startDate: "2026-09-05T09:00:00.000Z",
          endDate: "2026-09-01T09:00:00.000Z"
        },
        token
      );
      assert.equal(res.status, 422);
      assert.ok(res.body.errors.endDate);
    });

    it("creates an event and strips mass-assigned organizer/slug", async () => {
      const res = await client.json(
        "POST",
        "/api/events",
        {
          title: "Zod Test Open",
          city: "Bra",
          startDate: "2026-09-01T09:00:00.000Z",
          endDate: "2026-09-02T18:00:00.000Z",
          status: "published",
          organizer: "000000000000000000000999", // attempted mass-assignment
          slug: "hacked-slug" // attempted mass-assignment
        },
        token
      );
      assert.equal(res.status, 201);
      assert.notEqual(res.body.data.organizer, "000000000000000000000999", "organizer from token, not body");
      assert.equal(res.body.data.slug, "zod-test-open", "slug derived from title");
      assert.equal(res.body.data.status, "published", "allowed field applied");
    });
  });

  describe("PATCH /api/events/:id", () => {
    it("rejects an empty update with 422", async () => {
      const ev = await client.request("/api/events/chess-view-open-cuneo");
      const res = await client.json("PATCH", `/api/events/${ev.body.data._id}`, {}, token);
      assert.equal(res.status, 422);
    });

    it("applies a valid update", async () => {
      const ev = await client.request("/api/events/chess-view-open-cuneo");
      const res = await client.json("PATCH", `/api/events/${ev.body.data._id}`, { city: "Cuneo Updated" }, token);
      assert.equal(res.status, 200);
      assert.equal(res.body.data.city, "Cuneo Updated");
    });
  });

  describe("DELETE /api/events/:id", () => {
    it("deletes an event and cascades its children", async () => {
      const ev = await client.request("/api/events/chess-view-open-cuneo");
      const del = await client.json("DELETE", `/api/events/${ev.body.data._id}`, undefined, token);
      assert.equal(del.status, 200);
      const after = await client.request("/api/events/chess-view-open-cuneo");
      assert.equal(after.status, 404, "event gone");
    });
  });
});
