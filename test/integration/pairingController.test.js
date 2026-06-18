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

describe("pairingController", () => {
  let ctx, client, token, roundId, pairingId, whiteId, blackId;

  before(async () => {
    ctx = await startTestServer();
    client = makeClient(ctx.base);
  });
  after(() => stopTestServer(ctx));
  beforeEach(async () => {
    await reseed();
    token = await login(ctx.base);
    const bundle = await openCuneoBundle(client);
    roundId = bundle.rounds[0]._id;
    pairingId = bundle.pairings[0]._id; // Ada vs Bruno, result "pending"
    whiteId = bundle.players[0]._id;
    blackId = bundle.players[1]._id;
  });

  describe("GET /api/rounds/:roundId/pairings", () => {
    it("lists pairings for the round", async () => {
      const res = await client.request(`/api/rounds/${roundId}/pairings`);
      assert.equal(res.status, 200);
      assert.equal(res.body.data.length, 1);
    });
  });

  describe("POST /api/rounds/:roundId/pairings", () => {
    it("rejects a missing whitePlayer/boardNumber with 422", async () => {
      const res = await client.json("POST", `/api/rounds/${roundId}/pairings`, { result: "pending" }, token);
      assert.equal(res.status, 422);
    });

    it("creates a pairing, deriving event/section/round from the URL round", async () => {
      const res = await client.json(
        "POST",
        `/api/rounds/${roundId}/pairings`,
        { boardNumber: 2, whitePlayer: whiteId, blackPlayer: blackId },
        token
      );
      assert.equal(res.status, 201);
      assert.equal(String(res.body.data.round), String(roundId), "round derived from URL");
      assert.equal(String(res.body.data.whitePlayer), String(whiteId));
    });

    it("404s an unknown player", async () => {
      const res = await client.json(
        "POST",
        `/api/rounds/${roundId}/pairings`,
        { boardNumber: 3, whitePlayer: "000000000000000000000abc" },
        token
      );
      assert.equal(res.status, 404);
    });
  });

  describe("PATCH /api/pairings/:pairingId/result", () => {
    it("rejects an invalid result enum with 422", async () => {
      const res = await client.json("PATCH", `/api/pairings/${pairingId}/result`, { result: "draw" }, token);
      assert.equal(res.status, 422);
    });

    it("records a valid result", async () => {
      const res = await client.json("PATCH", `/api/pairings/${pairingId}/result`, { result: "1-0" }, token);
      assert.equal(res.status, 200);
      assert.equal(res.body.data.result, "1-0");
    });
  });
});
