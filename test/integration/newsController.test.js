const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startTestServer, stopTestServer, makeClient } = require("../../test-helpers/server");

describe("newsController", () => {
  let ctx, client;

  before(async () => {
    ctx = await startTestServer();
    client = makeClient(ctx.base);
  });
  after(() => stopTestServer(ctx));

  describe("GET /api/news", () => {
    it("lists source-first chess news for anonymous SSR consumers", async () => {
      const res = await client.request("/api/news?limit=3");

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.length, 3);
      assert.equal(res.body.meta.count, 3);
      assert.ok(res.body.meta.total >= 3);
      assert.ok(Array.isArray(res.body.meta.sources));
      assert.ok(res.body.meta.sources.some((source) => source.name === "ChessBase"));
      assert.ok(res.body.data[0].url.startsWith("https://"), "news cards link to original publishers");
    });
  });

  describe("GET /api/news/sources", () => {
    it("lists indexed publishers with counts", async () => {
      const res = await client.request("/api/news/sources");

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(res.body.data.some((source) => source.name === "Chess.com" && source.count > 0));
    });
  });
});
