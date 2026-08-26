const { after, before, describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { makeClient, startTestServer, stopTestServer } = require("../../test-helpers/server");

describe("health endpoints", () => {
  let ctx;
  let client;

  before(async () => {
    ctx = await startTestServer();
    client = makeClient(ctx.base);
  });

  after(() => stopTestServer(ctx));

  it("returns a stable non-sensitive deployment identity", async () => {
    const [health, ready] = await Promise.all([
      client.request("/api/health"),
      client.request("/api/ready")
    ]);

    assert.equal(health.status, 200);
    assert.equal(ready.status, 200);
    assert.equal(health.body.ok, true);
    assert.equal(health.body.service, "chessview-api");
    assert.equal(typeof health.body.deploymentSha, "string");
    assert.ok(health.body.deploymentSha.length > 0);
    assert.equal(health.body.deploymentSha, ready.body.deploymentSha);
    assert.equal(health.body.startedAt, ready.body.startedAt);
    assert.equal(Number.isNaN(Date.parse(health.body.startedAt)), false);
    assert.deepEqual(ready.body.dependencies, { database: "up" });
  });
});
