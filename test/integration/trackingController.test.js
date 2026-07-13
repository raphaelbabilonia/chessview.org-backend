const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { startTestServer, stopTestServer, reseed, makeClient } = require("../../test-helpers/server");
const TrackingEvent = require("../../src/models/TrackingEvent");
const { DEFAULT_DASHBOARD_CODE, rollupTrackingAnalytics } = require("../../src/services/trackingService");

describe("trackingController", () => {
  let ctx, client;

  before(async () => {
    process.env.TRACKING_ENABLED = "true";
    process.env.TRACKING_DASHBOARD_CODE = DEFAULT_DASHBOARD_CODE;
    ctx = await startTestServer();
    client = makeClient(ctx.base);
  });

  after(() => stopTestServer(ctx));

  beforeEach(async () => {
    await reseed();
  });

  it("ingests a valid tracking batch without storing raw visitor ids", async () => {
    const res = await client.json("POST", "/api/tracking/events", {
      events: [
        {
          eventName: "page_view",
          visitorId: "visitor-123",
          sessionId: "session-123",
          path: "/en/events?search=private",
          routeType: "events",
          locale: "en",
          filters: { country: "Italy", search: "open" },
          referrer: "https://google.com/search?q=chess"
        }
      ]
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.data.accepted, 1);
    const event = await TrackingEvent.findOne().lean();
    assert.equal(event.path, "/en/events");
    assert.notEqual(event.visitorHash, "visitor-123");
    assert.equal(event.referrerDomain, "google.com");
  });

  it("rejects invalid tracking events", async () => {
    const res = await client.json("POST", "/api/tracking/events", {
      events: [{ eventName: "steal_everything", path: "/en" }]
    });
    assert.equal(res.status, 422);
  });

  it("accepts coverage renderer lifecycle events", async () => {
    const res = await client.json("POST", "/api/tracking/events", {
      events: [
        {
          eventName: "coverage_map_renderer_change",
          path: "/en/coverage",
          routeType: "coverage",
          metadata: { mode: "3d" }
        },
        {
          eventName: "coverage_map_renderer_fallback",
          path: "/en/coverage",
          routeType: "coverage",
          metadata: { reason: "low-fps" }
        }
      ]
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.data.accepted, 2);
  });

  it("hides the dashboard behind the code and returns aggregates for the valid code", async () => {
    await client.json("POST", "/api/tracking/events", {
      events: [
        { eventName: "page_view", visitorId: "a", sessionId: "s1", path: "/en", routeType: "home", locale: "en" },
        {
          eventName: "event_original_click",
          visitorId: "a",
          sessionId: "s1",
          path: "/en/events/demo",
          routeType: "event_detail",
          locale: "en",
          outboundUrl: "https://example.org/tournament"
        }
      ]
    });
    await rollupTrackingAnalytics({ days: 1 });

    const bad = await client.request("/api/tracking/dashboard/wrong-code");
    assert.equal(bad.status, 404);

    const good = await client.request(`/api/tracking/dashboard/${DEFAULT_DASHBOARD_CODE}`);
    assert.equal(good.status, 200);
    assert.equal(good.body.data.totals.events, 2);
    assert.equal(good.body.data.totals.pageviews, 1);
    assert.equal(good.body.data.outboundHosts[0].name, "example.org");
  });
});
