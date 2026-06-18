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

describe("sectionController", () => {
  let ctx, client, token, eventId, sectionId, otherEventId;

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
    const family = await client.request("/api/events/sunday-family-chess-festival");
    otherEventId = family.body.data._id;
  });

  describe("POST /api/events/:eventId/sections", () => {
    it("rejects an empty name with 422", async () => {
      const res = await client.json("POST", `/api/events/${eventId}/sections`, { name: "" }, token);
      assert.equal(res.status, 422);
      assert.ok(res.body.errors.name);
    });

    it("creates a section under the URL's event", async () => {
      const res = await client.json("POST", `/api/events/${eventId}/sections`, { name: "Veterans" }, token);
      assert.equal(res.status, 201);
      assert.equal(res.body.data.name, "Veterans");
      assert.equal(String(res.body.data.event), String(eventId), "parented to the URL event");
    });

    it("403s a player (role gate)", async () => {
      const playerToken = await login(ctx.base, "player@chessview.local");
      const res = await client.json("POST", `/api/events/${eventId}/sections`, { name: "X" }, playerToken);
      assert.equal(res.status, 403);
    });
  });

  describe("PATCH /api/sections/:sectionId", () => {
    it("rejects an empty body with 422", async () => {
      const res = await client.json("PATCH", `/api/sections/${sectionId}`, {}, token);
      assert.equal(res.status, 422);
    });

    it("rejects an empty name with 422", async () => {
      const res = await client.json("PATCH", `/api/sections/${sectionId}`, { name: "" }, token);
      assert.equal(res.status, 422);
    });

    it("applies a valid update but strips a mass-assigned event (no reparent)", async () => {
      const res = await client.json(
        "PATCH",
        `/api/sections/${sectionId}`,
        { name: "Open (renamed)", event: otherEventId },
        token
      );
      assert.equal(res.status, 200);
      assert.equal(res.body.data.name, "Open (renamed)");
      assert.equal(String(res.body.data.event), String(eventId), "event not reparented");
    });
  });

  describe("DELETE /api/sections/:sectionId", () => {
    it("deletes a section", async () => {
      const res = await client.json("DELETE", `/api/sections/${sectionId}`, undefined, token);
      assert.equal(res.status, 200);
      const bundle = await openCuneoBundle(client);
      assert.ok(!bundle.sections.some((s) => String(s._id) === String(sectionId)), "section gone");
    });
  });
});
