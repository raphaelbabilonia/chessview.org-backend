const test = require("node:test");
const assert = require("node:assert/strict");
const { chessviewApiUrl, normalizeApiRoot } = require("../../src/utils/chessviewApiUrl");

test("normalizes API roots without creating duplicate api segments", () => {
  assert.equal(normalizeApiRoot("https://api.chessview.org"), "https://api.chessview.org/api");
  assert.equal(normalizeApiRoot("https://api.chessview.org/api/"), "https://api.chessview.org/api");
  assert.equal(normalizeApiRoot("https://api.chessview.org/api/api"), "https://api.chessview.org/api");
});

test("builds the same endpoint with or without a leading api segment", () => {
  const expected = "https://api.chessview.org/api/agent-ingest/submissions/tournaments";
  assert.equal(chessviewApiUrl("https://api.chessview.org/api", "/agent-ingest/submissions/tournaments"), expected);
  assert.equal(chessviewApiUrl("https://api.chessview.org", "/api/agent-ingest/submissions/tournaments"), expected);
});

test("rejects an empty API base URL", () => {
  assert.throws(() => normalizeApiRoot(""), /Missing CHESSVIEW_API_BASE_URL/);
});
