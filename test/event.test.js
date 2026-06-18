// Validation tests for the event endpoints (zod via the validate middleware),
// against an ephemeral MongoDB.
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-test-secret-test-secret";
process.env.NODE_ENV = "test";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { connectDB } = require("../src/config/db");
const seedDatabase = require("../src/utils/seedDatabase");

let mongod;
let server;
let base;
let token;

const api = async (path, options = {}) => {
  const res = await fetch(`${base}${path}`, options);
  return { status: res.status, body: await res.json() };
};
const authJson = (method, path, body) =>
  api(path, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  });

before(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  await connectDB();
  await seedDatabase();
  const app = require("../src/app");
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  const login = await api("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "organizer@chessview.local", password: "password123" })
  });
  token = login.body.data.token;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

test("rejects an invalid create payload with 422 and field errors", async () => {
  const res = await authJson("POST", "/api/events", { title: "" });
  assert.equal(res.status, 422);
  assert.equal(res.body.success, false);
  assert.ok(res.body.errors.title, "title error present");
  assert.ok(res.body.errors.city, "city error present");
  assert.ok(res.body.errors.startDate, "startDate error present");
});

test("creates an event and strips mass-assigned organizer/slug", async () => {
  const res = await authJson("POST", "/api/events", {
    title: "Zod Test Open",
    city: "Bra",
    startDate: "2026-09-01T09:00:00.000Z",
    endDate: "2026-09-02T18:00:00.000Z",
    status: "published",
    organizer: "000000000000000000000999", // attempted mass-assignment
    slug: "hacked-slug" // attempted mass-assignment
  });
  assert.equal(res.status, 201);
  assert.notEqual(res.body.data.organizer, "000000000000000000000999", "organizer not overridden");
  assert.equal(res.body.data.slug, "zod-test-open", "slug derived from title, not the client");
  assert.equal(res.body.data.status, "published", "allowed field applied");
});

test("rejects endDate before startDate", async () => {
  const res = await authJson("POST", "/api/events", {
    title: "Bad Dates",
    city: "Torino",
    startDate: "2026-09-05T09:00:00.000Z",
    endDate: "2026-09-01T09:00:00.000Z"
  });
  assert.equal(res.status, 422);
  assert.ok(res.body.errors.endDate, "endDate error present");
});

test("rejects an empty update with 422", async () => {
  const ev = await api("/api/events/chess-view-open-cuneo");
  const res = await authJson("PATCH", `/api/events/${ev.body.data._id}`, {});
  assert.equal(res.status, 422);
});

test("applies a valid update", async () => {
  const ev = await api("/api/events/chess-view-open-cuneo");
  const res = await authJson("PATCH", `/api/events/${ev.body.data._id}`, { city: "Cuneo Updated" });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.city, "Cuneo Updated");
});
