const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const Event = require("../src/models/Event");
const { resolveCuratedLocation } = require("../src/data/locationCoordinates");
const { cleanLocationPart, fetchEvents, geocodeLocation } = require("../src/scripts/backfillEventCoordinatesViaApi");
const { applyEventCoordinateUpdates } = require("../src/services/eventCoordinateService");
const { countryCodeFor, geocoderResultMatchesCountry } = require("../src/utils/geocodingSafety");

describe("coordinate location safety", () => {
  it("resolves an address-prefixed Barcelona city to Barcelona", () => {
    const resolved = resolveCuratedLocation({
      city: "Barcelona. Carrer Selva de Mar, 215 (Centre Cívic Sant Martí)",
      country: "Spain"
    });

    assert.deepEqual(resolved.coordinates, [2.177073, 41.3825802]);
    assert.equal(resolved.city, "Barcelona");
  });

  it("does not use a same-named curated city from the wrong country", () => {
    assert.equal(resolveCuratedLocation({ city: "Barcelona", country: "United States" }), null);
  });

  it("maps and validates geocoder country codes", () => {
    assert.equal(countryCodeFor("Spain"), "es");
    assert.equal(countryCodeFor("England"), "gb");
    assert.equal(countryCodeFor("United Kingdom"), "gb");
    assert.equal(countryCodeFor("Germany"), "de");
    assert.equal(countryCodeFor("Serbia"), "rs");
    assert.equal(countryCodeFor("Republic of Turkiye"), "tr");
    assert.equal(geocoderResultMatchesCountry({ address: { country_code: "es" } }, "Spain"), true);
    assert.equal(geocoderResultMatchesCountry({ address: { country_code: "mx" } }, "Spain"), false);
  });

  it("cleans query-only labels and postal noise without changing source fields", () => {
    assert.equal(cleanLocationPart("City: 00100 Rome (venue TBC)", { city: true }), "Rome");
    assert.equal(cleanLocationPart("Region: Lazio"), "Lazio");
  });

  it("fetches every production API page", async () => {
    const requestedPages = [];
    const fetchImpl = async (url) => {
      const page = Number(url.searchParams.get("page"));
      requestedPages.push(page);
      return {
        ok: true,
        json: async () => ({
          data: [{ _id: `event-${page}` }],
          meta: { hasNext: page < 3 }
        })
      };
    };

    const events = await fetchEvents({
      activeFrom: "2026-07-19",
      baseUrl: "https://api.example.test/api",
      fetchImpl
    });

    assert.deepEqual(requestedPages, [1, 2, 3]);
    assert.deepEqual(events.map((event) => event._id), ["event-1", "event-2", "event-3"]);
  });

  it("rejects a geocoder result outside the requested country", async () => {
    const fetchImpl = async (url) => {
      assert.equal(url.searchParams.get("countrycodes"), "es");
      return {
        ok: true,
        json: async () => [
          { lon: "-99.13", lat: "19.43", address: { country_code: "mx" }, display_name: "Barcelona, Mexico" }
        ]
      };
    };

    const result = await geocodeLocation(
      { city: "Barcelona", country: "Spain", region: "Catalonia" },
      { fetchImpl, userAgent: "ChessView test" }
    );

    assert.equal(result, null);
  });

  it("rejects an ingest patch whose verified country code conflicts with the event", async () => {
    const originalFindOne = Event.findOne;
    Event.findOne = async () => ({ _id: "event-spain", country: "Spain", title: "Spanish Open" });

    try {
      const result = await applyEventCoordinateUpdates({
        dryRun: true,
        items: [{
          eventId: "event-spain",
          country: "Spain",
          coordinateCountryCode: "mx",
          coordinates: [-99.13, 19.43],
          title: "Spanish Open"
        }]
      });

      assert.equal(result.updated.length, 0);
      assert.deepEqual(result.rejected, [{ title: "Spanish Open", reason: "coordinate-country-mismatch" }]);
    } finally {
      Event.findOne = originalFindOne;
    }
  });
});
