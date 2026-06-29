const { fetchJson, fetchText } = require("./httpClient");
const { compactText, stripHtml } = require("./tournamentUtils");

const SOURCE_NAME = "FIDE Rated Tournaments";
const DEFAULT_ENDPOINT = "https://ratings.fide.com/a_tournaments.php";
const DEFAULT_PUBLIC_URL = "https://ratings.fide.com/rated_tournaments.phtml";

const listFromPayload = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.aaData)) return payload.aaData;
  return [];
};

const parseDate = (value) => {
  const text = stripHtml(value);
  if (!text) return "";
  const normalized = text.includes(".") ? text.split(".").reverse().join("-") : text;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
};

const mapFideRatedTournament = (
  row,
  {
    checkedAt = new Date(),
    country = "Italy"
  } = {}
) => {
  const cells = Array.isArray(row) ? row : [];
  const eventId = stripHtml(cells[0] || row.id || row.event || "");
  const title = stripHtml(cells[1] || row.name || row.title || "");
  const city = stripHtml(cells[2] || row.city || "");
  const startDate = parseDate(cells[4] || row.start || row.startDate || "");
  const sourceUrl = eventId
    ? `https://ratings.fide.com/tournament_information.phtml?event=${encodeURIComponent(eventId)}`
    : DEFAULT_PUBLIC_URL;

  return {
    title,
    description: compactText(title),
    city: city || "Online",
    country,
    venue: city,
    address: "",
    startDate,
    endDate: startDate,
    timeControl: "",
    ratingType: "FIDE",
    sourceName: SOURCE_NAME,
    sourceUrl,
    resultsUrl: sourceUrl,
    originalId: eventId ? `fide-rated:event:${eventId}` : "",
    lastCheckedAt: checkedAt.toISOString()
  };
};

const searchFideRatedTournaments = async ({
  country = "ITA",
  countryName = "Italy",
  endpoint = DEFAULT_ENDPOINT,
  period = "current",
  limit = 25,
  rateLimitMs = 1500,
  respectRobots = true,
  timeoutMs = 20000,
  userAgent
} = {}) => {
  const checkedAt = new Date();
  const url = new URL(endpoint);
  url.searchParams.set("country", country);
  url.searchParams.set("period", period);

  let payload;
  try {
    payload = await fetchJson(url, {
      headers: {
        Referer: `${DEFAULT_PUBLIC_URL}?country=${encodeURIComponent(country)}`
      },
      rateLimitMs,
      respectRobots,
      timeoutMs,
      userAgent
    });
  } catch (error) {
    const body = await fetchText(url, {
      headers: {
        Referer: `${DEFAULT_PUBLIC_URL}?country=${encodeURIComponent(country)}`
      },
      rateLimitMs,
      respectRobots,
      timeoutMs,
      userAgent
    });
    if (!body.trim()) {
      return {
        sourceName: SOURCE_NAME,
        sourceUrl: `${DEFAULT_PUBLIC_URL}?country=${encodeURIComponent(country)}`,
        tournaments: [],
        warnings: ["FIDE Rated endpoint returned an empty response for direct server requests."]
      };
    }
    throw error;
  }

  const max = Math.max(Number(limit || 25), 1);
  const tournaments = listFromPayload(payload)
    .map((row) => mapFideRatedTournament(row, { checkedAt, country: countryName }))
    .filter((tournament) => tournament.title && tournament.startDate && tournament.sourceUrl)
    .slice(0, max);

  return {
    sourceName: SOURCE_NAME,
    sourceUrl: `${DEFAULT_PUBLIC_URL}?country=${encodeURIComponent(country)}`,
    tournaments,
    warnings: tournaments.length ? [] : ["FIDE Rated endpoint returned no importable tournaments."]
  };
};

module.exports = {
  DEFAULT_ENDPOINT,
  SOURCE_NAME,
  listFromPayload,
  mapFideRatedTournament,
  searchFideRatedTournaments
};
