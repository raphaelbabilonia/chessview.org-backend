const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { startTestServer, stopTestServer, reseed, makeClient } = require("../../test-helpers/server");
const NewsItem = require("../../src/models/NewsItem");

describe("newsController", () => {
  let ctx, client;

  before(async () => {
    ctx = await startTestServer();
    client = makeClient(ctx.base);
  });
  after(() => stopTestServer(ctx));
  beforeEach(async () => {
    await reseed();
  });

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
      assert.ok(res.body.data.every((item) => item.imageUrl && item.imageUrl.startsWith("https://")));
    });

    it("hides older database rows without publisher images", async () => {
      await NewsItem.collection.insertOne({
        title: "Legacy News Without Image",
        slug: "legacy-news-without-image",
        summary: "This old record should not be public because it has no publisher image.",
        sourceName: "Legacy Source",
        sourceHomeUrl: "https://legacy.example.org",
        sourceUrl: "https://legacy.example.org/news/no-image",
        canonicalUrl: "https://legacy.example.org/news/no-image",
        url: "https://legacy.example.org/news/no-image",
        imageUrl: "",
        publishStatus: "published",
        isPublic: true,
        createdAt: new Date("2026-07-01T00:00:00.000Z"),
        updatedAt: new Date("2026-07-01T00:00:00.000Z")
      });
      await NewsItem.create({
        title: "News With Image",
        slug: "news-with-image",
        summary: "This record has a publisher image and should remain visible.",
        sourceName: "Visible Source",
        sourceHomeUrl: "https://visible.example.org",
        sourceUrl: "https://visible.example.org/news/with-image",
        canonicalUrl: "https://visible.example.org/news/with-image",
        url: "https://visible.example.org/news/with-image",
        imageUrl: "https://visible.example.org/images/with-image.jpg",
        publishStatus: "published",
        isPublic: true
      });

      const res = await client.request("/api/news?limit=10");

      assert.equal(res.status, 200);
      assert.equal(res.body.meta.total, 1);
      assert.deepEqual(
        res.body.data.map((item) => item.title),
        ["News With Image"]
      );
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
