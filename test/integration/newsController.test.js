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

    describe("archive access", () => {
      const story = (index, overrides = {}) => ({
        title: `Archive Story ${index}`,
        slug: `archive-story-${index}`,
        summary: `A short original summary of archived story number ${index}.`,
        sourceName: "Archive Source",
        sourceHomeUrl: "https://archive.example.org",
        sourceUrl: `https://archive.example.org/news/${index}`,
        canonicalUrl: `https://archive.example.org/news/${index}`,
        url: `https://archive.example.org/news/${index}`,
        imageUrl: `https://archive.example.org/images/${index}.jpg`,
        publishedAt: new Date(Date.UTC(2026, 0, 1 + index)),
        publishStatus: "published",
        isPublic: true,
        ...overrides
      });

      it("pages past the first batch instead of repeating it", async () => {
        await NewsItem.create(Array.from({ length: 5 }, (_, index) => story(index)));

        const first = await client.request("/api/news?limit=2&page=1");
        const second = await client.request("/api/news?limit=2&page=2");
        const third = await client.request("/api/news?limit=2&page=3");

        assert.deepEqual(first.body.data.map((item) => item.title), ["Archive Story 4", "Archive Story 3"]);
        assert.deepEqual(second.body.data.map((item) => item.title), ["Archive Story 2", "Archive Story 1"]);
        assert.deepEqual(third.body.data.map((item) => item.title), ["Archive Story 0"]);
        assert.equal(first.body.meta.total, 5);
        assert.equal(first.body.meta.pages, 3);
        assert.equal(first.body.meta.hasNext, true);
        assert.equal(third.body.meta.hasNext, false);
        assert.equal(third.body.meta.hasPrev, true);
      });

      it("searches and filters across the whole archive, not one page", async () => {
        await NewsItem.create([
          ...Array.from({ length: 4 }, (_, index) => story(index + 10)),
          story(1, { title: "Oldest Candidates Tournament Report", sourceName: "Other Source" })
        ]);

        const searched = await client.request("/api/news?limit=2&search=candidates%20tournament");
        assert.deepEqual(searched.body.data.map((item) => item.sourceName), ["Other Source"]);
        assert.equal(searched.body.meta.total, 1);

        const filtered = await client.request("/api/news?limit=2&source=other%20source");
        assert.equal(filtered.body.meta.total, 1);
        assert.ok(filtered.body.meta.sources.length >= 2, "the source list stays complete while filtered");
      });

      it("treats search text literally", async () => {
        await NewsItem.create(story(1));
        const res = await client.request(`/api/news?search=${encodeURIComponent(".*")}`);
        assert.equal(res.status, 200);
        assert.equal(res.body.meta.total, 0);
      });
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
