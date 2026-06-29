const { fetchJson } = require("./httpClient");
const { compactText, inferRatingType, inferTimeControl, parseAddress, stripHtml } = require("./tournamentUtils");

const SOURCE_NAME = "ChessReg";
const DEFAULT_ENDPOINT = "https://chessreg.com/api/v/1/tournaments.json";

const listFromPayload = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.value)) return payload.value;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

const normalizeRoute = (item) => item.route || item.slug || item.id || "";

const toIso = (value) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
};

const mapChessRegTournament = (
  item,
  {
    checkedAt = new Date(),
    defaultCity = "Online",
    defaultCountry = "United States"
  } = {}
) => {
  const title = stripHtml(item.name || item.title);
  const sourceUrl = item.url || (item.route ? `https://chessreg.com/${item.route}` : "");
  const note = stripHtml(item.note || "");
  const address = parseAddress(item.address, { defaultCity, defaultCountry });
  const date = item.date || item.startDate || item.startsAt;

  return {
    title,
    description: compactText(item.note || title),
    city: address.city,
    country: address.country,
    venue: address.venue,
    address: address.address,
    startDate: toIso(date),
    endDate: toIso(item.endDate) || toIso(date),
    timeControl: inferTimeControl(`${title} ${note}`),
    ratingType: inferRatingType(`${title} ${note}`),
    sourceName: SOURCE_NAME,
    sourceUrl,
    registrationUrl: sourceUrl,
    originalId: `chessreg:tournament:${item.id || normalizeRoute(item)}`,
    lastCheckedAt: checkedAt.toISOString(),
    maxPlayers: Number(item.size || 0)
  };
};

const searchChessRegTournaments = async ({
  defaultCity,
  defaultCountry = "United States",
  endpoint = DEFAULT_ENDPOINT,
  limit = 25,
  rateLimitMs = 1000,
  respectRobots = false,
  timeoutMs = 20000,
  userAgent
} = {}) => {
  const checkedAt = new Date();
  const payload = await fetchJson(endpoint, {
    rateLimitMs,
    respectRobots,
    timeoutMs,
    userAgent
  });

  const max = Math.max(Number(limit || 25), 1);
  const tournaments = listFromPayload(payload)
    .map((item) => mapChessRegTournament(item, { checkedAt, defaultCity, defaultCountry }))
    .filter((tournament) => tournament.title && tournament.startDate && tournament.sourceUrl)
    .slice(0, max);

  return {
    sourceName: SOURCE_NAME,
    sourceUrl: endpoint,
    tournaments,
    warnings: tournaments.length ? [] : ["ChessReg API returned no importable tournaments."]
  };
};

module.exports = {
  DEFAULT_ENDPOINT,
  SOURCE_NAME,
  listFromPayload,
  mapChessRegTournament,
  searchChessRegTournaments
};
