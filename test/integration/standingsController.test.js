const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { startTestServer, stopTestServer, reseed, makeClient } = require("../../test-helpers/server");

// The seeded "Sunday Family Chess Festival" has three completed rounds with
// known results, so the standings are deterministic:
//   Nora Gallo 2.5 (2 wins) > Paolo Riva 2.0 (1) > Sara Marino 1.5 (1) > Tommaso Leone 0.0 (0)
describe("standingsController", () => {
  let ctx, client, eventId, sectionId;

  before(async () => {
    ctx = await startTestServer();
    client = makeClient(ctx.base);
  });
  after(() => stopTestServer(ctx));
  beforeEach(async () => {
    await reseed();
    const bundle = await client.request("/api/events/sunday-family-chess-festival");
    eventId = bundle.body.data._id;
    sectionId = bundle.body.data.sections[0]._id;
  });

  describe("GET /api/events/:eventId/standings", () => {
    it("ranks players by points, then wins", async () => {
      const res = await client.request(`/api/events/${eventId}/standings`);
      assert.equal(res.status, 200);
      const order = res.body.data.map((e) => `${e.lastName}:${e.points}:${e.wins}`);
      assert.deepEqual(order, ["Gallo:2.5:2", "Riva:2:1", "Marino:1.5:1", "Leone:0:0"]);
    });

    it("404s an unknown event", async () => {
      const res = await client.request("/api/events/000000000000000000000abc/standings");
      assert.equal(res.status, 404);
    });
  });

  describe("GET /api/sections/:sectionId/standings", () => {
    it("returns the same ranking for the single seeded section", async () => {
      const res = await client.request(`/api/sections/${sectionId}/standings`);
      assert.equal(res.status, 200);
      assert.equal(res.body.data[0].lastName, "Gallo");
      assert.equal(res.body.data[0].points, 2.5);
    });
  });
});
