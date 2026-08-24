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
      assert.equal(res.body.meta.limit, 50, "public lists are bounded by default");
      assert.equal(res.body.meta.page, 1);
      assert.ok(res.body.data.length <= 50);
    });

    it("keeps event lists light while exposing metadata summaries", async () => {
      await Event.updateOne(
        { slug: "chess-view-open-cuneo" },
        {
          startDate: daysFromNow(5),
          endDate: daysFromNow(6),
          status: "published",
          isPublic: true,
          metadata: {
            enrichmentStatus: "complete",
            registration: { fee: 30, currency: "EUR" },
            schedule: [{ label: "Round 1", date: "2026-09-01" }],
            historicalEditions: [{ year: 2025, playerCount: 64 }]
          },
          region: "Piemonte",
          location: {
            city: "Cuneo",
            country: "Italy",
            region: "Piemonte",
            longitude: 7.551,
            latitude: 44.384,
            coordinates: [7.551, 44.384],
            coordinateStatus: "resolved",
            coordinateSource: "curated"
          }
        }
      );

      const res = await client.request("/api/events");
      assert.equal(res.status, 200);
      const event = res.body.data.find((item) => item.slug === "chess-view-open-cuneo");
      assert.equal("metadata" in event, false, "list omits full metadata payload");
      assert.equal(event.metadataSummary.enrichmentStatus, "complete");
      assert.equal(event.metadataSummary.hasRegistration, true);
      assert.equal(event.metadataSummary.hasSchedule, true);
      assert.equal(event.metadataSummary.hasHistoricalData, true);
      assert.deepEqual(event.location.coordinates, [7.551, 44.384]);
      assert.equal(event.region, "Piemonte");
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

    it("treats text filters as literal search strings", async () => {
      await Event.updateOne(
        { slug: "chess-view-open-cuneo" },
        { title: "Chess View Open Cuneo [A]" }
      );

      const literal = await client.request("/api/events?includePast=true&search=%5BA%5D");
      assert.equal(literal.status, 200);
      assert.ok(literal.body.data.some((event) => event.slug === "chess-view-open-cuneo"));

      const invalidRegex = await client.request("/api/events?includePast=true&search=(");
      assert.equal(invalidRegex.status, 200);
      assert.deepEqual(invalidRegex.body.data, []);
    });

    it("does not expose draft events through public status filters", async () => {
      await Event.updateOne({ slug: "junior-rapid-challenge" }, { isPublic: true });

      const res = await client.request("/api/events?includePast=true&status=draft");
      assert.equal(res.status, 200);
      assert.equal(
        res.body.data.some((event) => event.slug === "junior-rapid-challenge"),
        false
      );
    });

    it("does not expose synthetic local-density events to public lists", async () => {
      const base = await Event.findOne({ slug: "chess-view-open-cuneo" }).lean();
      await Event.create({
        ...base,
        _id: undefined,
        title: "ChessView Local Density Test 082 - Turbigo rapid",
        slug: "chessview-local-density-test-082-turbigo-rapid",
        dedupeKey: "italy|turbigo|2026-07-07|local-density-082",
        city: "Turbigo",
        country: "Italy",
        websiteUrl: "https://chessview.org/local-test/tournaments/turbigo-082",
        startDate: daysFromNow(1),
        endDate: daysFromNow(2),
        status: "published",
        isPublic: true,
        source: {
          name: "ChessView Local Test Data",
          url: "https://chessview.org/local-test/tournaments/turbigo-082",
          originalId: "local-density-082"
        }
      });

      const res = await client.request("/api/events?includePast=true");
      assert.equal(res.status, 200);
      assert.equal(
        res.body.data.some((event) => event.slug === "chessview-local-density-test-082-turbigo-rapid"),
        false
      );
    });
  });

  describe("GET /api/events/catalog", () => {
    it("returns the active public map catalog in one compact response", async () => {
      await Event.updateOne(
        { slug: "chess-view-open-cuneo" },
        {
          startDate: daysFromNow(5),
          endDate: daysFromNow(6),
          status: "published",
          isPublic: true,
          description: "Large description that the map does not need",
          metadata: {
            format: { timeControlCategory: "classical" },
            logistics: { coordinates: [7.551, 44.384] },
            playerField: { expectedPlayers: 90 }
          }
        }
      );
      await Event.updateOne(
        { slug: "sunday-family-chess-festival" },
        { startDate: daysFromNow(-6), endDate: daysFromNow(-5), status: "completed", isPublic: true }
      );

      const res = await client.request("/api/events/catalog");
      assert.equal(res.status, 200);
      const event = res.body.data.find((item) => item.slug === "chess-view-open-cuneo");
      assert.ok(event, "active public event is returned");
      assert.equal(res.body.data.some((item) => item.slug === "sunday-family-chess-festival"), false);
      assert.equal(res.body.data.some((item) => item.slug === "junior-rapid-challenge"), false);
      assert.equal("description" in event, false);
      assert.equal("playerField" in event.metadata, false);
      assert.deepEqual(event.metadata.logistics.coordinates, [7.551, 44.384]);
      assert.equal(event.metadata.format.timeControlCategory, "classical");
      assert.deepEqual(Object.keys(event.metadata.logistics), ["coordinates"]);
      assert.deepEqual(Object.keys(event.metadata.format), ["timeControlCategory"]);
      assert.equal(res.body.meta.count, res.body.data.length);
      assert.match(res.headers["cache-control"], /stale-while-revalidate=300/);
    });

    it("includes the public archive only when explicitly requested", async () => {
      await Event.updateOne(
        { slug: "sunday-family-chess-festival" },
        { startDate: daysFromNow(-6), endDate: daysFromNow(-5), status: "completed", isPublic: true }
      );

      const res = await client.request("/api/events/catalog?includePast=true");
      assert.equal(res.status, 200);
      assert.ok(res.body.data.some((item) => item.slug === "sunday-family-chess-festival"));
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

    it("exposes full tournament metadata on the event detail endpoint", async () => {
      await Event.updateOne(
        { slug: "chess-view-open-cuneo" },
        {
          metadata: {
            enrichmentStatus: "complete",
            playerField: { expectedPlayers: 90 },
            historicalEditions: [{ year: 2025, winner: "Previous Winner" }]
          }
        }
      );

      const res = await client.request("/api/events/chess-view-open-cuneo");
      assert.equal(res.status, 200);
      assert.equal(res.body.data.metadata.playerField.expectedPlayers, 90);
      assert.equal(res.body.data.metadata.historicalEditions[0].winner, "Previous Winner");
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

    it("does not expose draft details even when isPublic is accidentally true", async () => {
      await Event.updateOne({ slug: "junior-rapid-challenge" }, { isPublic: true });

      const anon = await client.request("/api/events/junior-rapid-challenge");
      assert.equal(anon.status, 403, "draft event remains hidden");

      const owner = await client.request("/api/events/junior-rapid-challenge", {
        headers: { Authorization: `Bearer ${token}` }
      });
      assert.equal(owner.status, 200, "owner still sees their draft");
    });

    it("404s synthetic local-density event details for anonymous callers", async () => {
      const base = await Event.findOne({ slug: "chess-view-open-cuneo" }).lean();
      await Event.create({
        ...base,
        _id: undefined,
        title: "ChessView Local Density Test 082 - Turbigo rapid",
        slug: "chessview-local-density-test-082-turbigo-rapid",
        dedupeKey: "italy|turbigo|2026-07-07|local-density-082",
        city: "Turbigo",
        country: "Italy",
        websiteUrl: "https://chessview.org/local-test/tournaments/turbigo-082",
        startDate: daysFromNow(1),
        endDate: daysFromNow(2),
        status: "published",
        isPublic: true,
        source: {
          name: "ChessView Local Test Data",
          url: "https://chessview.org/local-test/tournaments/turbigo-082",
          originalId: "local-density-082"
        }
      });

      const anon = await client.request("/api/events/chessview-local-density-test-082-turbigo-rapid");
      assert.equal(anon.status, 404);
    });

    it("sanitizes public event bundles for anonymous callers", async () => {
      const res = await client.request("/api/events/chess-view-open-cuneo");
      assert.equal(res.status, 200);
      assert.equal(res.body.data.registrations.length, 0, "public bundle omits registrations");
      assert.equal("email" in res.body.data.organizer, false, "organizer email is private");
      assert.equal("email" in res.body.data.players[0], false, "player email is private");
      assert.equal("birthYear" in res.body.data.players[0], false, "player birth year is private");
      assert.equal("email" in res.body.data.standings[0].player, false, "standings embed sanitized players");
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
          country: "Italy",
          region: "Piemonte",
          location: {
            city: "Bra",
            country: "Italy",
            region: "Piemonte",
            longitude: 7.855,
            latitude: 44.697,
            coordinates: [7.855, 44.697],
            coordinateStatus: "resolved",
            coordinateSource: "manual"
          },
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
      assert.equal(res.body.data.country, "Italy");
      assert.deepEqual(res.body.data.location.coordinates, [7.855, 44.697]);
    });
  });

  describe("PATCH /api/events/:id", () => {
    it("rejects a malformed id with 400", async () => {
      const res = await client.json("PATCH", "/api/events/not-an-object-id", { city: "Nope" }, token);
      assert.equal(res.status, 400);
    });

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
