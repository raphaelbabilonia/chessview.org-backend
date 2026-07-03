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

describe("playerController", () => {
  let ctx, client, token, eventId, sectionId, playerId, otherSectionId;

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
    playerId = bundle.players[0]._id;
  });

  describe("GET /api/events/:eventId/players", () => {
    it("lists players for the event", async () => {
      const res = await client.request(`/api/events/${eventId}/players`);
      assert.equal(res.status, 200);
      assert.equal(res.body.data.length, 2, "open-cuneo seeds two players");
      assert.equal("email" in res.body.data[0], false, "anonymous player list is sanitized");
    });

    it("blocks anonymous player lists for private events", async () => {
      const privateEvent = await client.request("/api/events/junior-rapid-challenge", {
        headers: { Authorization: `Bearer ${token}` }
      });
      const res = await client.request(`/api/events/${privateEvent.body.data._id}/players`);
      assert.equal(res.status, 403);
    });

    it("rejects a malformed event id with 400", async () => {
      const res = await client.request("/api/events/not-an-object-id/players");
      assert.equal(res.status, 400);
    });
  });

  describe("POST /api/events/:eventId/players", () => {
    it("rejects a missing required field with 422", async () => {
      const res = await client.json(
        "POST",
        `/api/events/${eventId}/players`,
        { section: sectionId, firstName: "OnlyFirst" },
        token
      );
      assert.equal(res.status, 422);
      assert.ok(res.body.errors.lastName);
    });

    it("creates a player under the event/section", async () => {
      const res = await client.json(
        "POST",
        `/api/events/${eventId}/players`,
        { section: sectionId, firstName: "Carla", lastName: "Verdi", rating: 1500 },
        token
      );
      assert.equal(res.status, 201);
      assert.equal(res.body.data.lastName, "Verdi");
      assert.equal(String(res.body.data.section), String(sectionId));
    });
  });

  describe("PATCH /api/players/:playerId", () => {
    it("applies a valid update (and cannot reparent section)", async () => {
      const res = await client.json(
        "PATCH",
        `/api/players/${playerId}`,
        { rating: 1999, section: otherSectionId }, // section not in updatePlayerSchema
        token
      );
      assert.equal(res.status, 200);
      assert.equal(res.body.data.rating, 1999);
      assert.equal(String(res.body.data.section), String(sectionId), "section not reparented");
    });
  });

  describe("DELETE /api/players/:playerId", () => {
    it("deletes a player", async () => {
      const res = await client.json("DELETE", `/api/players/${playerId}`, undefined, token);
      assert.equal(res.status, 200);
      const list = await client.request(`/api/events/${eventId}/players`);
      assert.equal(list.body.data.length, 1, "one player removed");
    });
  });
});
