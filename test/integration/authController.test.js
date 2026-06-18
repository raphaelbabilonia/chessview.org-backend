const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { startTestServer, stopTestServer, reseed, makeClient } = require("../../test-helpers/server");

describe("authController", () => {
  let ctx, client;

  before(async () => {
    ctx = await startTestServer();
    client = makeClient(ctx.base);
  });
  after(() => stopTestServer(ctx));
  beforeEach(() => reseed());

  describe("POST /api/auth/register", () => {
    it("rejects a short password with 422", async () => {
      const res = await client.json("POST", "/api/auth/register", {
        name: "New User",
        email: "new@example.local",
        password: "short"
      });
      assert.equal(res.status, 422);
      assert.ok(res.body.errors.password);
    });

    it("rejects a malformed email with 422", async () => {
      const res = await client.json("POST", "/api/auth/register", {
        name: "New User",
        email: "not-an-email",
        password: "password123"
      });
      assert.equal(res.status, 422);
      assert.ok(res.body.errors.email);
    });

    it("registers a player and returns a token (role cannot be self-assigned)", async () => {
      const res = await client.json("POST", "/api/auth/register", {
        name: "New User",
        email: "new@example.local",
        password: "password123",
        role: "admin" // stripped by registerSchema
      });
      assert.equal(res.status, 200);
      assert.ok(res.body.data.token, "token returned");
      assert.equal(res.body.data.user.role, "player", "role forced to player");
      assert.equal("passwordHash" in res.body.data.user, false, "passwordHash never leaks");
    });

    it("rejects a duplicate email with 409", async () => {
      const res = await client.json("POST", "/api/auth/register", {
        name: "Dup",
        email: "organizer@chessview.local", // already seeded
        password: "password123"
      });
      assert.equal(res.status, 409);
    });
  });

  describe("POST /api/auth/login", () => {
    it("logs in a seeded account", async () => {
      const res = await client.json("POST", "/api/auth/login", {
        email: "organizer@chessview.local",
        password: "password123"
      });
      assert.equal(res.status, 200);
      assert.ok(res.body.data.token);
    });

    it("rejects wrong credentials with 401", async () => {
      const res = await client.json("POST", "/api/auth/login", {
        email: "organizer@chessview.local",
        password: "wrong-password"
      });
      assert.equal(res.status, 401);
    });

    it("rejects a malformed payload with 422", async () => {
      const res = await client.json("POST", "/api/auth/login", { email: "organizer@chessview.local" });
      assert.equal(res.status, 422);
    });
  });

  describe("GET /api/auth/me", () => {
    it("returns 401 without a token", async () => {
      const res = await client.request("/api/auth/me");
      assert.equal(res.status, 401);
    });

    it("returns the current user with a valid token", async () => {
      const login = await client.json("POST", "/api/auth/login", {
        email: "player@chessview.local",
        password: "password123"
      });
      const res = await client.request("/api/auth/me", {
        headers: { Authorization: `Bearer ${login.body.data.token}` }
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.data.email, "player@chessview.local");
      assert.equal("passwordHash" in res.body.data, false);
    });
  });
});
