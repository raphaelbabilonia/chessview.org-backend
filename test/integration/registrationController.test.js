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

describe("registrationController", () => {
  let ctx, client, token, playerToken, eventId, sectionId, registrationId;

  before(async () => {
    ctx = await startTestServer();
    client = makeClient(ctx.base);
  });
  after(() => stopTestServer(ctx));
  beforeEach(async () => {
    await reseed();
    token = await login(ctx.base); // organizer
    playerToken = await login(ctx.base, "player@chessview.local");
    const bundle = await openCuneoBundle(client);
    eventId = bundle._id;
    sectionId = bundle.sections[0]._id;
    registrationId = bundle.registrations[0]._id; // Luca Bianchi, pending
  });

  describe("POST /api/events/:eventId/registrations", () => {
    it("rejects a malformed payload with 422", async () => {
      const res = await client.json(
        "POST",
        `/api/events/${eventId}/registrations`,
        { section: sectionId, firstName: "No", lastName: "Email" }, // email missing
        playerToken
      );
      assert.equal(res.status, 422);
      assert.ok(res.body.errors.email);
    });

    it("creates a pending registration, forcing status/user (no mass-assignment)", async () => {
      const res = await client.json(
        "POST",
        `/api/events/${eventId}/registrations`,
        {
          section: sectionId,
          firstName: "Marco",
          lastName: "Rossi",
          email: "marco@example.local",
          status: "approved", // stripped — forced to "pending"
          user: "000000000000000000000999" // stripped — forced to the caller
        },
        playerToken
      );
      assert.equal(res.status, 201);
      assert.equal(res.body.data.status, "pending", "status forced to pending");
    });
  });

  describe("GET /api/events/:eventId/registrations", () => {
    it("lists registrations for a manager", async () => {
      const res = await client.request(`/api/events/${eventId}/registrations`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      assert.equal(res.status, 200);
      assert.ok(res.body.data.length >= 1);
    });

    it("403s a non-manager (player)", async () => {
      const res = await client.request(`/api/events/${eventId}/registrations`, {
        headers: { Authorization: `Bearer ${playerToken}` }
      });
      assert.equal(res.status, 403);
    });
  });

  describe("PATCH /api/registrations/:registrationId/status", () => {
    it("rejects an invalid status enum with 422", async () => {
      const res = await client.json("PATCH", `/api/registrations/${registrationId}/status`, { status: "bogus" }, token);
      assert.equal(res.status, 422);
    });

    it("approving promotes the registration to a Player exactly once (idempotent)", async () => {
      const before = await client.request(`/api/events/${eventId}/players`);
      assert.equal(before.body.data.length, 2, "two players seeded");

      const first = await client.json("PATCH", `/api/registrations/${registrationId}/status`, { status: "approved" }, token);
      assert.equal(first.status, 200);
      const afterFirst = await client.request(`/api/events/${eventId}/players`);
      assert.equal(afterFirst.body.data.length, 3, "approval created a player");

      // Re-approve — must NOT create a second player for the same email.
      await client.json("PATCH", `/api/registrations/${registrationId}/status`, { status: "approved" }, token);
      const afterSecond = await client.request(`/api/events/${eventId}/players`);
      assert.equal(afterSecond.body.data.length, 3, "re-approval is idempotent");
    });
  });
});
