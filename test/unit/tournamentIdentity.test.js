const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  canonicalFamilyKey,
  familySimilarity,
  normalizeUrl,
  tournamentContentHash,
  tournamentSourceKeys
} = require("../../src/utils/tournamentIdentity");
const { canonicalCountryName } = require("../../src/utils/countryNames");

describe("tournamentIdentity", () => {
  const tournament = {
    title: "Milano International Open Rapid",
    startDate: "2026-10-10",
    endDate: "2026-10-12",
    country: "Italy",
    city: "Milano",
    venue: "Main Hall"
  };

  it("creates the same family key despite accents, case, and time-control words", () => {
    const alternate = { ...tournament, title: "MILANO Internationál Open", country: "ITALY" };
    assert.equal(canonicalFamilyKey(tournament), canonicalFamilyKey(alternate));
  });

  it("creates source-scoped identifiers and normalizes tracking URLs", () => {
    const keys = tournamentSourceKeys({
      sourceName: "Vesus API",
      originalId: "event-123",
      sourceUrl: "https://vesus.org/event/abc/?utm_source=test#details"
    });
    assert.equal(keys.length, 1);
    assert.ok(keys.some((key) => key.includes("event-123")));
    assert.equal(normalizeUrl("https://vesus.org/event/abc/?utm_source=test#details"), "https://vesus.org/event/abc");
    assert.deepEqual(
      tournamentSourceKeys({ sourceName: "URL-only source", sourceUrl: "https://example.org/event/1" }),
      ["source:url only source:url:https://example.org/event/1"]
    );
  });

  it("keeps content hashes stable when object key order changes", () => {
    const first = tournamentContentHash({ ...tournament, metadata: { rounds: 7, rated: true } });
    const second = tournamentContentHash({ ...tournament, metadata: { rated: true, rounds: 7 } });
    assert.equal(first, second);
  });

  it("keeps content hashes stable when only audit timestamps change", () => {
    const first = tournamentContentHash({
      ...tournament,
      metadata: { sourceAudit: { capturedAt: "2026-07-20T01:00:00.000Z", authority: "platform" } }
    });
    const second = tournamentContentHash({
      ...tournament,
      metadata: { sourceAudit: { capturedAt: "2026-07-21T01:00:00.000Z", authority: "platform" } }
    });
    assert.equal(first, second);
  });

  it("scores close cross-source records highly and different dates as zero", () => {
    assert.ok(familySimilarity(tournament, { ...tournament, venueName: tournament.venue }) >= 0.9);
    assert.equal(familySimilarity(tournament, { ...tournament, startDate: "2026-11-10" }), 0);
  });

  it("canonicalizes country aliases used by source feeds", () => {
    assert.equal(canonicalCountryName("United States of America"), "United States");
    assert.equal(canonicalCountryName("Hong Kong, China"), "China");
    assert.equal(canonicalCountryName("Republic of Turkiye"), "Turkey");
    assert.equal(canonicalCountryName("Korea"), "South Korea");
    assert.equal(canonicalCountryName("Türkiye"), "Turkey");
  });
});
