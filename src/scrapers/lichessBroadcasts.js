const { DEFAULT_USER_AGENT, fetchJson, fetchText } = require("./httpClient");

const SOURCE_NAME = "Lichess Broadcasts";
const DEFAULT_BASE_URL = "https://lichess.org";

const normalizeDate = (timestamp) => {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const parseLocation = (location) => {
  const clean = String(location || "").replace(/\s+/g, " ").trim();
  if (!clean) return { city: "Online", country: "Global", venue: "" };

  const parts = clean
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    return {
      city: parts[0],
      country: parts[parts.length - 1],
      venue: clean
    };
  }

  return {
    city: clean,
    country: "Global",
    venue: clean
  };
};

const inferTimeControl = (info = {}) => {
  const fideTC = String(info.fideTC || "").toLowerCase();
  if (["standard", "rapid", "blitz"].includes(fideTC)) return fideTC;

  const tc = String(info.tc || "").toLowerCase();
  if (tc.includes("blitz") || /\b(1|2|3|4|5)\s*min\b/.test(tc)) return "blitz";
  if (tc.includes("rapid") || /\b(10|15|25|30)\s*min\b/.test(tc)) return "rapid";
  if (tc.includes("classical") || tc.includes("standard")) return "standard";

  return tc ? "mixed" : "";
};

const inferRatingType = (tour = {}, info = {}) => {
  const sourceText = [tour.name, info.website, info.standings, info.regulations].filter(Boolean).join(" ").toLowerCase();
  if (sourceText.includes("fide") || sourceText.includes("chess-results")) return "FIDE";
  if (sourceText.includes("uschess") || sourceText.includes("us chess") || sourceText.includes("national")) {
    return "national";
  }

  return "";
};

const compactDescription = (info = {}) => {
  return [info.format, info.tc, info.location].filter(Boolean).join(" - ");
};

const mapBroadcastToTournament = (item, { checkedAt = new Date() } = {}) => {
  const tour = item.tour || {};
  const round = item.round || {};
  const info = tour.info || {};
  const [startTimestamp, endTimestamp] = Array.isArray(tour.dates) ? tour.dates : [];
  const startDate = normalizeDate(startTimestamp || round.startsAt || tour.createdAt);
  const endDate = normalizeDate(endTimestamp || round.finishedAt || startTimestamp || round.startsAt || tour.createdAt);
  const location = parseLocation(info.location);

  return {
    title: tour.name || round.name || "Lichess Broadcast",
    description: compactDescription(info),
    startDate,
    endDate,
    country: location.country,
    city: location.city,
    venue: location.venue,
    timeControl: inferTimeControl(info),
    ratingType: inferRatingType(tour, info),
    sourceName: SOURCE_NAME,
    sourceUrl: tour.url,
    registrationUrl: info.website || "",
    resultsUrl: info.standings || round.url || tour.url || "",
    regulationsUrl: info.regulations || "",
    originalId: tour.id ? `lichess:broadcast:${tour.id}` : "",
    lastCheckedAt: checkedAt.toISOString(),
    raw: {
      tourId: tour.id || "",
      roundId: round.id || "",
      slug: tour.slug || "",
      tier: tour.tier || null,
      currentRoundName: round.name || ""
    }
  };
};

const tourIdFromUrl = (sourceUrl = "") => {
  try {
    const parts = new URL(sourceUrl).pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] || "";
  } catch {
    return "";
  }
};

const pgnChunks = (pgnText) => {
  const text = String(pgnText || "").trim();
  if (!text) return [];
  const starts = [...text.matchAll(/(?:^|\n)(?=\[Event\s+")/g)].map((match) => match.index + (text[match.index] === "\n" ? 1 : 0));
  if (!starts.length) return [];
  return starts.map((start, index) => text.slice(start, starts[index + 1] || text.length).trim()).filter(Boolean);
};

const parsePgnTags = (chunk) => {
  const tags = {};
  for (const line of String(chunk || "").split(/\r?\n/)) {
    const match = line.match(/^\[([A-Za-z0-9_]+)\s+"(.*)"\]$/);
    if (match) tags[match[1]] = match[2].replace(/\\"/g, '"');
    if (!line.trim()) break;
  }
  return tags;
};

const parseLichessPgn = (pgnText) =>
  pgnChunks(pgnText)
    .map((chunk, index) => {
      const tags = parsePgnTags(chunk);
      if (!tags.White || !tags.Black) return null;
      return {
        boardNumber: index + 1,
        result: tags.Result || "",
        externalId: tags.GameURL || `${tags.White}-${tags.Black}-${index + 1}`,
        white: {
          name: tags.White,
          federation: "",
          rating: Number(tags.WhiteElo || 0),
          fideId: tags.WhiteFideId || "",
          title: tags.WhiteTitle || "",
          team: tags.WhiteTeam || "",
          externalId: tags.WhiteFideId ? `fide:${tags.WhiteFideId}` : `lichess:player:${tags.White.toLowerCase()}`
        },
        black: {
          name: tags.Black,
          federation: "",
          rating: Number(tags.BlackElo || 0),
          fideId: tags.BlackFideId || "",
          title: tags.BlackTitle || "",
          team: tags.BlackTeam || "",
          externalId: tags.BlackFideId ? `fide:${tags.BlackFideId}` : `lichess:player:${tags.Black.toLowerCase()}`
        }
      };
    })
    .filter(Boolean);

const searchLichessBroadcasts = async ({
  query = "world",
  page = 1,
  baseUrl = DEFAULT_BASE_URL,
  rateLimitMs = 1000,
  respectRobots = false,
  timeoutMs = 20000,
  userAgent = DEFAULT_USER_AGENT
} = {}) => {
  const url = new URL("/api/broadcast/search", baseUrl);
  url.searchParams.set("q", query);
  url.searchParams.set("page", String(page));

  const response = await fetchJson(url, {
    rateLimitMs,
    respectRobots,
    timeoutMs,
    userAgent
  });
  const checkedAt = new Date();

  return {
    sourceName: SOURCE_NAME,
    sourceUrl: url.toString(),
    currentPage: response.currentPage,
    maxPerPage: response.maxPerPage,
    tournaments: (response.currentPageResults || []).map((item) => mapBroadcastToTournament(item, { checkedAt }))
  };
};

const fetchLichessBroadcastDetail = async ({
  sourceUrl,
  tourId = tourIdFromUrl(sourceUrl),
  baseUrl = DEFAULT_BASE_URL,
  rateLimitMs = 1000,
  timeoutMs = 20000,
  userAgent = DEFAULT_USER_AGENT
} = {}) => {
  if (!tourId) throw new Error(`Unable to resolve Lichess broadcast id from ${sourceUrl}`);

  const checkedAt = new Date();
  const payload = await fetchJson(new URL(`/api/broadcast/${tourId}`, baseUrl), {
    rateLimitMs,
    respectRobots: false,
    timeoutMs,
    userAgent
  });
  const rounds = [];
  const documents = [];

  if (payload.tour?.info?.regulations) {
    documents.push({
      label: "Lichess broadcast regulations",
      type: "pdf",
      url: payload.tour.info.regulations,
      originalId: `lichess:regulations:${tourId}`
    });
  }
  if (payload.tour?.info?.standings) {
    documents.push({
      label: "Lichess broadcast standings",
      type: "results",
      url: payload.tour.info.standings,
      originalId: `lichess:standings:${tourId}`
    });
  }

  for (const [index, round] of (payload.rounds || []).entries()) {
    const pgnUrl = new URL(`/api/broadcast/round/${round.id}.pgn`, baseUrl).toString();
    let pairings = [];
    try {
      const pgn = await fetchText(pgnUrl, {
        headers: { Accept: "application/x-chess-pgn,text/plain,*/*" },
        rateLimitMs,
        respectRobots: false,
        timeoutMs,
        userAgent
      });
      pairings = parseLichessPgn(pgn);
      documents.push({
        label: `${round.name || `Round ${index + 1}`} PGN`,
        type: "pgn",
        url: pgnUrl,
        originalId: `lichess:pgn:${round.id}`
      });
    } catch (error) {
      documents.push({
        label: `${round.name || `Round ${index + 1}`} PGN unavailable`,
        type: "other",
        url: round.url || sourceUrl,
        originalId: `lichess:pgn-failed:${round.id}`
      });
    }

    rounds.push({
      number: index + 1,
      name: round.name || `Round ${index + 1}`,
      status: round.finished ? "completed" : "published",
      startsAt: normalizeDate(round.startsAt),
      externalId: `lichess:round:${round.id}`,
      pairings
    });
  }

  return {
    sourceName: SOURCE_NAME,
    checkedAt: checkedAt.toISOString(),
    sectionName: payload.tour?.info?.format || "Broadcast",
    sections: [
      {
        name: payload.tour?.info?.format || "Broadcast",
        timeControl: inferTimeControl(payload.tour?.info || {}),
        roundsCount: rounds.length,
        externalId: `lichess:section:${tourId}`
      }
    ],
    players: [],
    rounds,
    documents,
    sourceUrl: payload.tour?.url || sourceUrl
  };
};

module.exports = {
  SOURCE_NAME,
  fetchLichessBroadcastDetail,
  inferRatingType,
  inferTimeControl,
  mapBroadcastToTournament,
  parseLichessPgn,
  parseLocation,
  searchLichessBroadcasts
};
