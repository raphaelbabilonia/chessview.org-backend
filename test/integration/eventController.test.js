const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { startTestServer, stopTestServer, reseed, makeClient, login } = require("../../test-helpers/server");
const Event = require("../../src/models/Event");
const EventDocument = require("../../src/models/EventDocument");
const Pairing = require("../../src/models/Pairing");
const Player = require("../../src/models/Player");
const Round = require("../../src/models/Round");
const Section = require("../../src/models/Section");
const User = require("../../src/models/User");

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

    it("supports time-control filtering and deterministic relevance and update sorting", async () => {
      await Event.updateOne(
        { slug: "chess-view-open-cuneo" },
        {
          title: "Cuneo Open",
          startDate: daysFromNow(5),
          endDate: daysFromNow(6),
          status: "published",
          isPublic: true,
          timeControl: "classical"
        }
      );
      await Event.updateOne(
        { slug: "sunday-family-chess-festival" },
        {
          title: "Festival near Cuneo",
          city: "Cuneo",
          startDate: daysFromNow(8),
          endDate: daysFromNow(9),
          status: "published",
          isPublic: true,
          timeControl: "rapid"
        }
      );

      const filtered = await client.request("/api/events?timeControl=classical");
      assert.equal(filtered.status, 200);
      assert.deepEqual(filtered.body.data.map((event) => event.slug), ["chess-view-open-cuneo"]);

      const relevant = await client.request("/api/events?search=Cuneo&sort=relevance");
      assert.equal(relevant.status, 200);
      assert.equal(relevant.body.data[0].slug, "chess-view-open-cuneo", "title match outranks city match");

      await Event.updateOne(
        { slug: "sunday-family-chess-festival" },
        { $set: { updatedAt: daysFromNow(2) } },
        { timestamps: false }
      );
      const updated = await client.request("/api/events?sort=updated");
      assert.equal(updated.status, 200);
      assert.equal(updated.body.data[0].slug, "sunday-family-chess-festival");
    });
  });

  describe("GET /api/events/facets", () => {
    it("returns capped aggregate country, city, and time-control counts for eligible public events", async () => {
      await Event.updateOne(
        { slug: "chess-view-open-cuneo" },
        {
          startDate: daysFromNow(5),
          endDate: daysFromNow(6),
          status: "published",
          isPublic: true,
          country: "Italy",
          city: "Cuneo",
          timeControl: "classical"
        }
      );
      await Event.updateOne(
        { slug: "sunday-family-chess-festival" },
        {
          startDate: daysFromNow(8),
          endDate: daysFromNow(9),
          status: "published",
          isPublic: true,
          country: "Italy",
          city: "Cuneo",
          timeControl: "rapid"
        }
      );

      const res = await client.request("/api/events/facets");
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.data.countries[0], { value: "Italy", count: 2 });
      assert.deepEqual(res.body.data.cities[0], { value: "Cuneo", count: 2 });
      assert.deepEqual(
        res.body.data.timeControls,
        [
          { value: "classical", count: 1 },
          { value: "rapid", count: 1 }
        ]
      );
      assert.equal(res.body.meta.valuesLimit, 100);
      assert.match(res.headers["cache-control"], /stale-while-revalidate=900/);
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
          timeControl: "",
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
      assert.equal("metadata" in event, false);
      assert.equal("location" in event, false);
      assert.deepEqual(event.coordinates, [7.551, 44.384]);
      assert.equal(event.timeControl, "classical");
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

    it("marks only attributable, useful records as indexable and can filter to them", async () => {
      await Event.updateOne(
        { slug: "chess-view-open-cuneo" },
        {
          startDate: daysFromNow(5),
          endDate: daysFromNow(6),
          status: "published",
          isPublic: true,
          country: "Italy",
          websiteUrl: "https://example.org/cuneo"
        }
      );
      await Event.updateOne(
        { slug: "sunday-family-chess-festival" },
        {
          startDate: daysFromNow(8),
          endDate: daysFromNow(9),
          status: "published",
          isPublic: true,
          country: "Italy",
          websiteUrl: "",
          resultsUrl: "",
          regulationsUrl: "",
          externalLinks: [],
          source: { name: "Unattributed", url: "" }
        }
      );

      const res = await client.request("/api/events/catalog?indexableOnly=true");
      assert.equal(res.status, 200);
      assert.equal(res.body.data.some((item) => item.slug === "chess-view-open-cuneo"), true);
      assert.equal(res.body.data.some((item) => item.slug === "sunday-family-chess-festival"), false);
      assert.equal(res.body.data.every((item) => item.indexable === true), true);
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

    it("exposes useful allowlisted tournament metadata on the event detail endpoint", async () => {
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
      const event = await Event.findOne({ slug: "chess-view-open-cuneo" });
      await Event.updateOne(
        { _id: event._id },
        {
          sourceOrganizerName: "Official Cuneo Chess Club",
          sourceRefs: [{ sourceKey: "private-key", name: "Private audit source", url: "https://private.example" }],
          dedupeKey: "private-dedupe-key",
          source: {
            name: "Official source",
            url: "https://example.org/event",
            originalId: "private-source-id",
            detailStatus: "failed",
            detailError: "private fetch trace"
          },
          metadata: {
            enrichmentStatus: "complete",
            format: { timeControlCategory: "classical", internal: "private format trace" },
            logistics: { city: "Cuneo", raw: "private raw address" },
            sourceAudit: { authority: "publisher", sourcesVisited: ["private audit trail"] },
            reviewEvidence: { reviewer: "private reviewer" },
            internal: { agentIdentity: "ChessView Agent Publisher" },
            runId: "private-run-id"
          }
        }
      );
      await User.updateOne({ _id: event.organizer }, { name: "ChessView Agent Publisher" });
      await Section.updateOne({ event: event._id }, { source: { name: "private section source", originalId: "section-private" } });
      await Round.updateOne({ event: event._id }, { source: { name: "private round source", originalId: "round-private" } });
      await Pairing.updateOne(
        { event: event._id },
        { notes: "private pairing note", source: { name: "private pairing source", originalId: "pairing-private" } }
      );
      await Player.updateOne(
        { event: event._id },
        { sourceMatches: ["private match trace"], source: { name: "private player source", originalId: "player-private" } }
      );
      await EventDocument.create([
        {
          event: event._id,
          label: "Public regulations",
          type: "regulations",
          url: "https://example.org/regulations.pdf",
          localPath: "C:\\private\\regulations.pdf",
          error: "private document trace",
          source: { name: "private document source", originalId: "document-private" }
        },
        {
          event: event._id,
          label: "Failed private document",
          url: "https://example.org/failed.pdf",
          status: "failed",
          error: "private failure"
        }
      ]);

      const res = await client.request("/api/events/chess-view-open-cuneo");
      assert.equal(res.status, 200);
      assert.equal(res.body.data.registrations.length, 0, "public bundle omits registrations");
      assert.deepEqual(res.body.data.organizer, { name: "Official Cuneo Chess Club" });
      assert.equal("email" in res.body.data.organizer, false, "organizer email is private");
      assert.equal("email" in res.body.data.players[0], false, "player email is private");
      assert.equal("birthYear" in res.body.data.players[0], false, "player birth year is private");
      assert.equal("email" in res.body.data.standings[0].player, false, "standings embed sanitized players");
      assert.equal("dedupeKey" in res.body.data, false);
      assert.equal("sourceRefs" in res.body.data, false);
      assert.equal("sourceAudit" in res.body.data.metadata, false);
      assert.equal("reviewEvidence" in res.body.data.metadata, false);
      assert.equal("internal" in res.body.data.metadata.format, false);
      assert.equal("raw" in res.body.data.metadata.logistics, false);
      assert.equal("originalId" in res.body.data.source, false);
      assert.equal("detailStatus" in res.body.data.source, false);
      assert.equal("source" in res.body.data.sections[0], false);
      assert.equal("source" in res.body.data.rounds[0], false);
      assert.equal("notes" in res.body.data.pairings[0], false);
      assert.equal("source" in res.body.data.pairings[0], false);
      assert.equal("sourceMatches" in res.body.data.players[0], false);
      assert.equal(res.body.data.documents.length, 1, "failed operational documents are hidden");
      assert.equal("localPath" in res.body.data.documents[0], false);
      assert.equal("error" in res.body.data.documents[0], false);
      assert.equal("source" in res.body.data.documents[0], false);
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
