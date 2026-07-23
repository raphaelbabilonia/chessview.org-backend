const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { startTestServer, stopTestServer, reseed, makeClient } = require("../../test-helpers/server");
const AgentSubmission = require("../../src/models/AgentSubmission");
const Event = require("../../src/models/Event");
const NewsItem = require("../../src/models/NewsItem");
const { reviewPublicAgentSubmissions } = require("../../src/services/agentCollaborationService");

const eventItem = {
  kind: "event",
  title: "Public Agent Test Open",
  startDate: "2026-11-10",
  endDate: "2026-11-12",
  country: "Italy",
  city: "Milano",
  venue: "Open Queue Hall",
  timeControl: "standard",
  ratingType: "FIDE",
  sourceName: "Public Agent Source",
  sourceUrl: "https://example.org/events/public-agent-test-open",
  websiteUrl: "https://example.org/events/public-agent-test-open",
  registrationUrl: "https://example.org/events/public-agent-test-open/register",
  confidence: 0.93,
  qualityFlags: [],
  evidenceRefs: [
    {
      refId: "source-1",
      sourceUrl: "https://example.org/events/public-agent-test-open",
      capturedAt: "2026-07-03T12:00:00.000Z",
      excerpt: "Public Agent Test Open listed for November 10-12, 2026 in Milano."
    }
  ]
};

const newsItem = {
  kind: "news",
  title: "Public Agent Test News",
  summary: "A source-first chess news preview submitted by a public agent for weekly review.",
  sourceName: "Public Agent News",
  sourceUrl: "https://example.org/news/public-agent-test-news",
  canonicalUrl: "https://example.org/news/public-agent-test-news",
  publishedAt: "2026-07-03T10:00:00.000Z",
  imageUrl: "https://example.org/images/public-agent-test-news.jpg",
  language: "en",
  category: "tournament",
  confidence: 0.9,
  qualityFlags: []
};

const batch = (items, overrides = {}) => ({
  schemaVersion: 1,
  runId: "integration-agent-run",
  agent: {
    name: "Integration Test Agent",
    version: "0.1.0",
    url: "https://example.org/agent",
    repositoryUrl: "https://example.org/agent/repo"
  },
  items,
  ...overrides
});

describe("agentCollaborationController", () => {
  let ctx, client;

  before(async () => {
    process.env.AGENT_COLLABORATION_SALT = "agent-collaboration-test-salt";
    ctx = await startTestServer();
    client = makeClient(ctx.base);
  });

  after(() => stopTestServer(ctx));

  beforeEach(async () => {
    await reseed();
  });

  it("dry-runs public submissions without an agent publish token or writes", async () => {
    const res = await client.json("POST", "/api/agent-collaboration/submissions", batch([eventItem, newsItem], { dryRun: true }));

    assert.equal(res.status, 200);
    assert.equal(res.body.dryRun, true);
    assert.equal(res.body.meta.queued, 2);
    assert.equal(await AgentSubmission.countDocuments(), 0);
  });

  it("queues valid public submissions and exposes safe public status", async () => {
    const res = await client.json("POST", "/api/agent-collaboration/submissions", batch([eventItem]));

    assert.equal(res.status, 202);
    assert.equal(res.body.meta.queued, 1);
    const submissionId = res.body.queued[0].submissionId;

    const status = await client.request(`/api/agent-collaboration/submissions/${submissionId}`);
    assert.equal(status.status, 200);
    assert.equal(status.body.data.status, "queued");
    assert.equal(status.body.data.kind, "event");
    assert.equal(status.body.data.title, eventItem.title);
    assert.equal(status.body.data.request, undefined);
  });

  it("rejects unsafe URLs and copied article bodies before queueing", async () => {
    const unsafe = {
      ...newsItem,
      sourceUrl: "http://127.0.0.1/private",
      canonicalUrl: "http://127.0.0.1/private",
      articleBody: "A full copied article body should not be accepted by the public queue."
    };

    const res = await client.json("POST", "/api/agent-collaboration/submissions", batch([unsafe]));

    assert.equal(res.status, 422);
    assert.equal(res.body.meta.queued, 0);
    assert.equal(res.body.meta.rejected, 1);
    assert.ok(res.body.rejected[0].reasons.some((reason) => reason.includes("private networks")));
    assert.ok(res.body.rejected[0].reasons.some((reason) => reason.includes("articleBody")));
    assert.equal(await AgentSubmission.countDocuments(), 0);
  });

  it("serves machine-readable OpenAPI and submission schema documents", async () => {
    const openApi = await client.request("/api/agent-collaboration/openapi.json");
    const schema = await client.request("/api/agent-collaboration/schema.json");

    assert.equal(openApi.status, 200);
    assert.equal(openApi.body.openapi, "3.1.0");
    assert.equal(schema.status, 200);
    assert.equal(schema.body.title, "ChessView Agent Collaboration Submission");
  });

  it("routes tournament submissions to shared review while news keeps its existing publisher", async () => {
    const res = await client.json("POST", "/api/agent-collaboration/submissions", batch([eventItem, newsItem]));
    assert.equal(res.status, 202);

    const review = await reviewPublicAgentSubmissions({
      dryRun: false,
      now: new Date("2026-07-05T12:00:00.000Z"),
      reviewRunId: "integration-public-review"
    });

    assert.equal(review.accepted, 1);
    assert.equal(review.deferredEvents.length, 1);
    assert.equal(review.deferredEvents[0].title, eventItem.title);
    assert.equal(await Event.countDocuments({ title: eventItem.title }), 0);
    assert.equal(await NewsItem.countDocuments({ title: newsItem.title }), 1);
    assert.equal(await AgentSubmission.countDocuments({ status: "published" }), 1);
    assert.equal(await AgentSubmission.countDocuments({ kind: "event", status: "queued" }), 1);
  });

  it("exports queued tournaments through the private intake and accepts final shared-pipeline status", async () => {
    const previous = process.env.AGENT_PUBLISH_TOKEN;
    process.env.AGENT_PUBLISH_TOKEN = "collaboration-private-test-token";
    try {
      const queued = await client.json("POST", "/api/agent-collaboration/submissions", batch([eventItem]));
      const submissionId = queued.body.queued[0].submissionId;
      const exported = await client.request("/api/agent-ingest/submissions/tournaments?limit=10", {
        headers: { "X-Agent-Publish-Token": process.env.AGENT_PUBLISH_TOKEN }
      });
      assert.equal(exported.status, 200);
      assert.equal(exported.body.data.length, 1);
      assert.equal(exported.body.data[0].submissionId, submissionId);

      const completed = await client.request("/api/agent-ingest/submissions/tournaments/status", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Agent-Publish-Token": process.env.AGENT_PUBLISH_TOKEN },
        body: JSON.stringify({ outcomes: [{ submissionId, status: "published", reviewRunId: "shared-review-test", reasons: ["verified"] }] })
      });
      assert.equal(completed.status, 200);
      assert.equal(completed.body.updated, 1);
      assert.equal((await AgentSubmission.findOne({ submissionId }).lean()).status, "published");
    } finally {
      process.env.AGENT_PUBLISH_TOKEN = previous;
    }
  });

  it("quarantines low-confidence submissions during weekly review", async () => {
    const lowConfidence = { ...eventItem, title: "Low Confidence Public Agent Open", confidence: 0.5 };
    const res = await client.json("POST", "/api/agent-collaboration/submissions", batch([lowConfidence]));
    assert.equal(res.status, 202);

    const review = await reviewPublicAgentSubmissions({
      dryRun: false,
      now: new Date("2026-07-05T12:00:00.000Z"),
      reviewRunId: "integration-low-confidence-review"
    });

    assert.equal(review.accepted, 0);
    const submission = await AgentSubmission.findOne({ "normalized.title": lowConfidence.title }).lean();
    assert.equal(submission.status, "quarantined");
    assert.ok(submission.decision.reasons.some((reason) => reason.includes("confidence")));
  });
});
