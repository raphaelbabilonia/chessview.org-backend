const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const {
  startTestServer,
  stopTestServer,
  reseed,
  makeClient,
  login,
  openCuneoBundle
} = require("../../test-helpers/server");

describe("roundController", () => {
  let ctx, client, token, eventId, sectionId, otherSectionId;

  before(async () => {
    ctx = await startTestServer();
    client = makeClient(ctx.base);
  });
  after(() => stopTestServer(ctx));
  beforeEach(async () => {
    await reseed();
    token = await login(ctx.base);
    const bundle = await openCuneoBundle(client);
    eventId = bundle._id;
    sectionId = bundle.sections[0]._id;
    otherSectionId = bundle.sections[1]._id;
  });

  describe("GET /api/events/:eventId/rounds", () => {
    it("lists rounds for the event", async () => {
      const res = await client.request(`/api/events/${eventId}/rounds`);
      assert.equal(res.status, 200);
      assert.equal(res.body.data.length, 1, "open-cuneo seeds one round");
    });
  });

  describe("POST /api/events/:eventId/rounds", () => {
    it("rejects a missing number/section with 422", async () => {
      const res = await client.json("POST", `/api/events/${eventId}/rounds`, { name: "Round X" }, token);
      assert.equal(res.status, 422);
    });

    it("404s when the section doesn't belong to the event", async () => {
      const family = await client.request("/api/events/sunday-family-chess-festival");
      const foreignSection = family.body.data.sections[0]._id;
      const res = await client.json(
        "POST",
        `/api/events/${eventId}/rounds`,
        { section: foreignSection, number: 2 },
        token
      );
      assert.equal(res.status, 404);
    });

    it("creates a round under the event/section", async () => {
      const res = await client.json(
        "POST",
        `/api/events/${eventId}/rounds`,
        { section: sectionId, number: 2, name: "Round 2" },
        token
      );
      assert.equal(res.status, 201);
      assert.equal(String(res.body.data.section), String(sectionId));
    });
  });

  describe("PATCH /api/rounds/:roundId", () => {
    it("applies a valid update but cannot reparent to another section", async () => {
      const created = await client.json(
        "POST",
        `/api/events/${eventId}/rounds`,
        { section: sectionId, number: 9 },
        token
      );
      const roundId = created.body.data._id;

      const res = await client.json(
        "PATCH",
        `/api/rounds/${roundId}`,
        { name: "Renamed", section: otherSectionId }, // section not in updateRoundSchema
        token
      );
      assert.equal(res.status, 200);
      assert.equal(res.body.data.name, "Renamed", "allowed field applied");
      assert.equal(String(res.body.data.section), String(sectionId), "section not reparented");
    });

    it("rejects an empty update with 422", async () => {
      const created = await client.json(
        "POST",
        `/api/events/${eventId}/rounds`,
        { section: sectionId, number: 10 },
        token
      );
      const res = await client.json("PATCH", `/api/rounds/${created.body.data._id}`, {}, token);
      assert.equal(res.status, 422);
    });
  });
});
