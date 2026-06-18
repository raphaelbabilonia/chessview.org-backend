// Shared bootstrap for the integration suites under test/integration/.
//
// Each `node --test` test file runs in its own process, so every suite that
// calls startTestServer() gets its own ephemeral mongodb-memory-server + app
// instance — fully isolated, no shared state across files.
//
// This file deliberately lives OUTSIDE test/: `node --test` default discovery
// treats every .js under test/ as a test file (the **/test/**/*.js pattern), so
// a helper placed there would be loaded and counted as an empty test. Keeping it
// in test-helpers/ keeps the suite/test counts clean.
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-test-secret-test-secret";
process.env.NODE_ENV = "test";

const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { connectDB } = require("../src/config/db");
const seedDatabase = require("../src/utils/seedDatabase");

// Boots an in-RAM MongoDB, connects, seeds, and starts the real app on a random
// port. Returns the handles stopTestServer() needs plus the base URL.
const startTestServer = async () => {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  await connectDB();
  await seedDatabase();
  // require app AFTER the connection is up; it builds the router at import time.
  const app = require("../src/app");
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  return { mongod, server, base };
};

const stopTestServer = async (ctx) => {
  if (!ctx) return;
  if (ctx.server) await new Promise((resolve) => ctx.server.close(resolve));
  await mongoose.disconnect();
  if (ctx.mongod) await ctx.mongod.stop();
};

// Wipes and re-seeds the database. Call from beforeEach so each test starts from
// the known seed state and tests don't depend on each other's mutations.
const reseed = () => seedDatabase();

// A tiny fetch wrapper bound to a base URL. `request` is raw; `json` sends a JSON
// body and (optionally) a bearer token.
const makeClient = (base) => {
  const request = async (path, options = {}) => {
    const res = await fetch(`${base}${path}`, options);
    return { status: res.status, body: await res.json() };
  };
  const json = (method, path, body, token) =>
    request(path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  return { request, json };
};

// Logs in a seeded account and returns its JWT. Defaults to the organizer.
const login = async (base, email = "organizer@chessview.local", password = "password123") => {
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const body = await res.json();
  return body.data && body.data.token;
};

// Convenience: the full chess-view-open-cuneo bundle (sections, players, rounds,
// pairings, registrations) — the easiest source of seeded ids for tests.
const openCuneoBundle = async (client) => {
  const res = await client.request("/api/events/chess-view-open-cuneo");
  return res.body.data;
};

module.exports = {
  startTestServer,
  stopTestServer,
  reseed,
  makeClient,
  login,
  openCuneoBundle
};
