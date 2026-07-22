const { after, before, beforeEach, describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { startTestServer, stopTestServer, reseed, makeClient } = require("../../test-helpers/server");

describe("retired tracking routes", () => {
  let ctx, client;

  before(async () => {
    ctx = await startTestServer();
    client = makeClient(ctx.base);
  });

  after(async () => {
    await stopTestServer(ctx);
  });

  beforeEach(async () => {
    await reseed();
  });

  it("does not expose the legacy event ingestion endpoint", async () => {
    const response = await client.json("POST", "/api/tracking/events", {
      events: [{ eventName: "page_view", path: "/en" }],
    });
    assert.equal(response.status, 404);
  });

  it("does not expose the legacy dashboard endpoint", async () => {
    const response = await client.request("/api/tracking/dashboard/retired");
    assert.equal(response.status, 404);
  });
});
