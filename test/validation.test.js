// Validation coverage for the tournament controllers (zod via the validate
// middleware), against an ephemeral MongoDB.
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-test-secret-test-secret";
process.env.NODE_ENV = "test";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { connectDB } = require("../src/config/db");
const seedDatabase = require("../src/utils/seedDatabase");
const Round = require("../src/models/Round");

let mongod;
let server;
let base;
let token;
let eventId;
let sectionId;
let otherSectionId;
let registrationId;

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

  const bundle = await api("/api/events/chess-view-open-cuneo");
  eventId = bundle.body.data._id;
  sectionId = bundle.body.data.sections[0]._id;
  otherSectionId = bundle.body.data.sections[1]._id;
  registrationId = bundle.body.data.registrations[0]._id;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

test("section: empty name -> 422, valid -> 201", async () => {
  const bad = await authJson("POST", `/api/events/${eventId}/sections`, { name: "" });
  assert.equal(bad.status, 422);
  assert.ok(bad.body.errors.name);
  const ok = await authJson("POST", `/api/events/${eventId}/sections`, { name: "Veterans" });
  assert.equal(ok.status, 201);
});

test("player: missing required field -> 422", async () => {
  const res = await authJson("POST", `/api/events/${eventId}/players`, {
    section: sectionId,
    firstName: "OnlyFirst"
  });
  assert.equal(res.status, 422);
  assert.ok(res.body.errors.lastName);
});

test("registration status: invalid enum -> 422", async () => {
  const res = await authJson("PATCH", `/api/registrations/${registrationId}/status`, { status: "bogus" });
  assert.equal(res.status, 422);
});

test("round update cannot reparent to another section (mass-assignment stripped)", async () => {
  const created = await authJson("POST", `/api/events/${eventId}/rounds`, { section: sectionId, number: 9 });
  assert.equal(created.status, 201);
  const roundId = created.body.data._id;

  const patched = await authJson("PATCH", `/api/rounds/${roundId}`, {
    section: otherSectionId, // attempted reparent — not in updateRoundSchema
    name: "Renamed"
  });
  assert.equal(patched.status, 200);

  const round = await Round.findById(roundId).lean();
  assert.equal(String(round.section), String(sectionId), "section not reparented");
  assert.equal(round.name, "Renamed", "allowed field applied");
});

test("auth register: short password -> 422", async () => {
  const res = await api("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "New User", email: "new@example.local", password: "short" })
  });
  assert.equal(res.status, 422);
  assert.ok(res.body.errors.password);
});
