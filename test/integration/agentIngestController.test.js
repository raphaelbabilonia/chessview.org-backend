const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { startTestServer, stopTestServer, reseed, makeClient } = require("../../test-helpers/server");
const Event = require("../../src/models/Event");
const NewsItem = require("../../src/models/NewsItem");

const token = "agent-test-token";

const tournamentItem = {
  schemaVersion: 1,
  title: "Agent Test Open",
  startDate: "2026-10-10",
  endDate: "2026-10-12",
  country: "Italy",
  city: "Milano",
  venue: "Agent Hall",
  timeControl: "standard",
  ratingType: "FIDE",
  sourceName: "Agent Source",
  sourceUrl: "https://example.org/tournaments/agent-test-open",
  websiteUrl: "https://example.org/tournaments/agent-test-open",
  registrationUrl: "https://example.org/tournaments/agent-test-open/register",
  resultsUrl: "https://example.org/tournaments/agent-test-open/results",
  metadata: {
    enrichmentStatus: "complete",
    format: {
      system: "Swiss",
      rounds: 7,
      timeControls: ["90+30"],
      fideRated: true
    },
    registration: {
      status: "open",
      deadline: "2026-10-01",
      fee: 50,
      currency: "EUR"
    },
    playerField: {
      expectedPlayers: 80,
      minRating: 1200,
      maxRating: 2400
    },
    historicalEditions: [
      {
        year: 2025,
        playerCount: 72,
        winner: "Agent Winner",
        sourceUrl: "https://example.org/tournaments/agent-test-open-2025/results"
      }
    ],
    sourceAudit: {
      extractedAt: "2026-07-03T16:00:00.000Z",
      sourcesVisited: [
        {
          name: "Agent Source",
          url: "https://example.org/tournaments/agent-test-open",
          status: "used"
        }
      ]
    }
  },
  originalId: "agent-test-open-2026",
  confidence: 0.91,
  qualityFlags: [],
  evidenceRefs: [
    {
      refId: "ev-001",
      sourceUrl: "https://example.org/tournaments/agent-test-open",
      capturedAt: "2026-07-03T16:00:00.000Z",
      excerpt: "Agent Test Open listed for October 10-12, 2026 in Milano."
    }
  ],
  dedupeKey: "italy|milano|2026-10-10|agent-test-open",
  lastCheckedAt: "2026-07-03T16:00:00.000Z",
  approvedAt: "2026-07-03T16:30:00.000Z",
  approvedBy: "codex-review",
  publishStatus: "ready"
};

const newsItem = {
  schemaVersion: 1,
  title: "Agent Test News Story",
  slug: "agent-test-news-story",
  summary:
    "An example chess news story is ready for publication with a short original summary and a clear source link for readers.",
  summaryType: "generated",
  sourceName: "Agent News",
  sourceUrl: "https://example.org/news/agent-test-news-story",
  canonicalUrl: "https://example.org/news/agent-test-news-story",
  author: "Agent Desk",
  publishedAt: "2026-07-03T10:00:00.000Z",
  language: "en",
  region: "global",
  category: "tournament",
  imageUrl: "https://example.org/images/agent-test-news-story.jpg",
  tags: ["agent", "test"],
  originalId: "agent-news-001",
  contentHash: "agent-news-hash-001",
  confidence: 0.9,
  qualityFlags: [],
  evidenceRefs: [
    {
      refId: "ev-001",
      sourceUrl: "https://example.org/news/agent-test-news-story",
      canonicalUrl: "https://example.org/news/agent-test-news-story",
      capturedAt: "2026-07-03T16:00:00.000Z",
      excerpt: "Agent Test News Story appears as an example chess article."
    }
  ],
  dedupeKey: "2026-07-03|agent-test-news-story",
  lastCheckedAt: "2026-07-03T16:00:00.000Z",
  approvedAt: "2026-07-03T16:30:00.000Z",
  approvedBy: "codex-review",
  publishStatus: "ready"
};

const postIngest = (client, path, body, providedToken = token) =>
  client.request(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(providedToken ? { "X-Agent-Publish-Token": providedToken } : {})
    },
    body: JSON.stringify(body)
  });

describe("agentIngestController", () => {
  let ctx, client;

  before(async () => {
    process.env.AGENT_PUBLISH_TOKEN = token;
    process.env.AGENT_PUBLISH_USER_EMAIL = "admin@chessview.local";
    ctx = await startTestServer();
    client = makeClient(ctx.base);
  });

  after(() => stopTestServer(ctx));

  beforeEach(async () => {
    await reseed();
  });

  it("rejects missing or invalid agent token", async () => {
    const missing = await postIngest(client, "/api/agent-ingest/tournaments", { items: [] }, "");
    assert.equal(missing.status, 401);

    const invalid = await postIngest(client, "/api/agent-ingest/tournaments", { items: [] }, "wrong-token");
    assert.equal(invalid.status, 401);
  });

  it("accepts the publisher token compatibility env name", async () => {
    const originalAgentToken = process.env.AGENT_PUBLISH_TOKEN;
    const originalChessViewToken = process.env.CHESSVIEW_AGENT_PUBLISH_TOKEN;
    process.env.AGENT_PUBLISH_TOKEN = "";
    process.env.CHESSVIEW_AGENT_PUBLISH_TOKEN = token;

    try {
      const res = await postIngest(client, "/api/agent-ingest/news", {
        dryRun: true,
        runId: "fallback-token",
        items: []
      });

      assert.equal(res.status, 200);
      assert.equal(res.body.meta.errors, 0);
    } finally {
      process.env.AGENT_PUBLISH_TOKEN = originalAgentToken;
      process.env.CHESSVIEW_AGENT_PUBLISH_TOKEN = originalChessViewToken;
    }
  });

  it("dry-runs tournament ingest without writing", async () => {
    const res = await postIngest(client, "/api/agent-ingest/tournaments", {
      dryRun: true,
      runId: "dry-run-tournaments",
      items: [tournamentItem]
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.dryRun, true);
    assert.equal(res.body.meta.created, 1);
    assert.equal(await Event.countDocuments({ dedupeKey: tournamentItem.dedupeKey }), 0);
  });

  it("rejects synthetic local-density tournament fixtures without writing", async () => {
    const syntheticFixture = {
      ...tournamentItem,
      title: "ChessView Local Density Test 082 - Turbigo rapid",
      city: "Turbigo",
      venue: "Turbigo Test Chess Hall 2",
      sourceName: "ChessView Local Test Data",
      sourceUrl: "https://chessview.org/local-test/tournaments/turbigo-082",
      websiteUrl: "https://chessview.org/local-test/tournaments/turbigo-082",
      originalId: "local-density-082",
      dedupeKey: "italy|turbigo|2026-07-07|local-density-082",
      approvedBy: "codex-local-map-density-fixture",
      metadata: {
        ...tournamentItem.metadata,
        summary: "Synthetic local test tournament for dense ChessView map QA. Not production source data.",
        sourceAudit: {
          extractionStatus: "local-test-data"
        }
      }
    };

    const res = await postIngest(client, "/api/agent-ingest/tournaments", {
      dryRun: false,
      runId: "reject-local-density",
      items: [syntheticFixture]
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.meta.rejected, 1);
    assert.ok(res.body.rejected[0].reasons.includes("synthetic/local test fixture is not allowed in production ingest"));
    assert.equal(await Event.countDocuments({ dedupeKey: syntheticFixture.dedupeKey }), 0);
  });

  it("publishes tournaments idempotently and preserves source metadata", async () => {
    const first = await postIngest(client, "/api/agent-ingest/tournaments", {
      dryRun: false,
      runId: "publish-tournaments",
      items: [tournamentItem]
    });
    assert.equal(first.status, 200);
    assert.equal(first.body.meta.created, 1);

    const created = await Event.findOne({ dedupeKey: tournamentItem.dedupeKey }).lean();
    assert.equal(created.source.name, "Agent Source");
    assert.equal(created.country, "Italy");
    assert.equal(created.resultsUrl, tournamentItem.resultsUrl);
    assert.equal(created.metadata.enrichmentStatus, "complete");
    assert.equal(created.metadata.format.rounds, 7);
    assert.equal(created.metadata.historicalEditions[0].playerCount, 72);
    assert.ok(created.externalLinks.some((link) => link.type === "registration"));

    const second = await postIngest(client, "/api/agent-ingest/tournaments", {
      dryRun: false,
      runId: "publish-tournaments-again",
      items: [{ ...tournamentItem, venue: "Updated Agent Hall" }]
    });
    assert.equal(second.status, 200);
    assert.equal(second.body.meta.created, 0);
    assert.equal(second.body.meta.updated, 1);
    assert.equal(await Event.countDocuments({ dedupeKey: tournamentItem.dedupeKey }), 1);
  });

  it("updates event coordinates through the private coordinate ingest endpoint", async () => {
    const target = await Event.findOne({ slug: "chess-view-open-cuneo" }).lean();
    const res = await postIngest(client, "/api/agent-ingest/coordinates", {
      dryRun: false,
      runId: "coordinate-backfill",
      items: [
        {
          eventId: String(target._id),
          title: target.title,
          city: "Cuneo",
          country: "Italy",
          region: "Piemonte",
          coordinates: [7.551, 44.384],
          coordinateSource: "test-geocoder",
          coordinateLabel: "Cuneo, Piemonte, Italy"
        }
      ]
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.meta.updated, 1);

    const updated = await Event.findById(target._id).lean();
    assert.equal(updated.region, "Piemonte");
    assert.deepEqual(updated.location.coordinates, [7.551, 44.384]);
    assert.equal(updated.location.coordinateSource, "test-geocoder");
    assert.deepEqual(updated.metadata.logistics.coordinates, [7.551, 44.384]);
  });

  it("publishes news idempotently and feeds GET /api/news", async () => {
    const first = await postIngest(client, "/api/agent-ingest/news", {
      dryRun: false,
      runId: "publish-news",
      items: [newsItem]
    });
    assert.equal(first.status, 200);
    assert.equal(first.body.meta.created, 1);

    const list = await client.request("/api/news?limit=1");
    assert.equal(list.status, 200);
    assert.equal(list.body.data[0].id, newsItem.slug);
    assert.equal(list.body.data[0].url, newsItem.canonicalUrl);
    assert.equal(list.body.data[0].imageUrl, newsItem.imageUrl);
    assert.equal(list.body.data[0].sourceUrl, newsItem.sourceUrl);
    assert.deepEqual(list.body.data[0].tags, newsItem.tags);

    const second = await postIngest(client, "/api/agent-ingest/news", {
      dryRun: false,
      runId: "publish-news-again",
      items: [{ ...newsItem, summary: `${newsItem.summary} Updated.` }]
    });
    assert.equal(second.status, 200);
    assert.equal(second.body.meta.created, 0);
    assert.equal(second.body.meta.updated, 1);
    assert.equal(await NewsItem.countDocuments({ dedupeKey: newsItem.dedupeKey }), 1);
  });

  it("derives bridge fields for minimally normalized news", async () => {
    const relaxed = {
      title: "Relaxed Agent News Story",
      summary: "A short source-first bridge summary gives readers enough context while still sending them to the original publisher.",
      sourceName: "Relaxed News",
      sourceUrl: "https://example.org/news/relaxed-agent-news-story",
      imageUrl: "https://example.org/images/relaxed-agent-news-story.jpg",
      confidence: 0.72,
      publishStatus: "ready"
    };

    const res = await postIngest(client, "/api/agent-ingest/news", {
      dryRun: false,
      runId: "publish-relaxed-news",
      items: [relaxed]
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.meta.created, 1);

    const created = await NewsItem.findOne({ sourceUrl: relaxed.sourceUrl }).lean();
    assert.equal(created.canonicalUrl, relaxed.sourceUrl);
    assert.equal(created.sourceHomeUrl, "https://example.org");
    assert.equal(created.slug, "relaxed-agent-news-story");
    assert.equal(created.imageUrl, relaxed.imageUrl);
    assert.ok(created.dedupeKey.includes("relaxed-agent-news-story"));
    assert.ok(created.contentHash);
    assert.equal(created.evidenceRefs.length, 1);
  });

  it("rejects news without a publisher image", async () => {
    const imageLess = {
      ...newsItem,
      title: "Agent Image Less News Story",
      slug: "agent-image-less-news-story",
      sourceUrl: "https://example.org/news/agent-image-less-news-story",
      canonicalUrl: "https://example.org/news/agent-image-less-news-story",
      originalId: "agent-news-no-image",
      contentHash: "agent-news-no-image-hash",
      dedupeKey: "2026-07-03|agent-image-less-news-story",
      imageUrl: ""
    };

    const res = await postIngest(client, "/api/agent-ingest/news", {
      dryRun: false,
      runId: "publish-news-without-image",
      items: [imageLess]
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.meta.rejected, 1);
    assert.ok(res.body.rejected[0].reasons.includes("missing required publisher image"));
    assert.equal(await NewsItem.countDocuments({ dedupeKey: imageLess.dedupeKey }), 0);
  });

  it("rejects gated items without writing them", async () => {
    const blockedTournament = await postIngest(client, "/api/agent-ingest/tournaments", {
      dryRun: false,
      items: [{ ...tournamentItem, dedupeKey: "blocked-tournament", qualityFlags: ["legal_review_required"] }]
    });
    assert.equal(blockedTournament.status, 200);
    assert.equal(blockedTournament.body.meta.rejected, 1);
    assert.equal(await Event.countDocuments({ dedupeKey: "blocked-tournament" }), 0);

    const blockedNews = await postIngest(client, "/api/agent-ingest/news", {
      dryRun: false,
      items: [{ ...newsItem, dedupeKey: "blocked-news", canonicalUrl: "https://example.org/news/blocked", qualityFlags: ["paywall_detected"] }]
    });
    assert.equal(blockedNews.status, 200);
    assert.equal(blockedNews.body.meta.rejected, 1);
    assert.equal(await NewsItem.countDocuments({ dedupeKey: "blocked-news" }), 0);
  });
});
