const https = require("https");
const { DEFAULT_USER_AGENT, fetchJson } = require("./httpClient");
const { compactText, stripHtml } = require("./tournamentUtils");

const SOURCE_NAME = "Vesus";
const DEFAULT_ENDPOINT = "https://vesus.org";
const DEFAULT_API_ENDPOINT = "https://api.vesus.org/graphql";

const OPERATIONS = {
  eventsPage: {
    operationName: "EventsPage_Query",
    docId: "d69683783f759da1bb924b5b6d285745"
  },
  tournamentPage: {
    operationName: "TournamentPage_Query",
    docId: "b21eddc8bbb8f9b350af17928aea8cbd"
  },
  pairingsPage: {
    operationName: "PairingsPage_Query",
    docId: "d056fbfa7b7333375fbf284a5cad2fff"
  },
  pairingsSubscription: {
    operationName: "PairingsPage_Subscription",
    docId: "6cb5e5a2748efdd5ab70d8e6b136e2e4"
  }
};

const countryNames = {
  ARG: "Argentina",
  AUS: "Australia",
  AUT: "Austria",
  BRA: "Brazil",
  CAN: "Canada",
  CHE: "Switzerland",
  DEU: "Germany",
  ESP: "Spain",
  FIN: "Finland",
  FRA: "France",
  GBR: "United Kingdom",
  IND: "India",
  ITA: "Italy",
  MEX: "Mexico",
  NLD: "Netherlands",
  NZL: "New Zealand",
  POL: "Poland",
  SVN: "Slovenia",
  USA: "United States",
  ZAF: "South Africa"
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const vesusUrl = (path, baseUrl = DEFAULT_ENDPOINT) => new URL(path, baseUrl).toString();

const mediaUrl = (filename, baseUrl = DEFAULT_ENDPOINT) =>
  filename ? vesusUrl(`/assets/regulations/${encodeURIComponent(filename)}`, baseUrl) : "";

const normalizeDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
};

const normalizeList = (value) => (Array.isArray(value) ? value : []);

const uniqueByUrl = (documents) => {
  const seen = new Set();
  return documents.filter((document) => {
    if (!document?.url || seen.has(document.url)) return false;
    seen.add(document.url);
    return true;
  });
};

const timeControlFromVesus = (value) => {
  const code = String(value || "").toUpperCase();
  if (code === "BLITZ") return "blitz";
  if (code === "RAPID") return "rapid";
  if (code === "STANDARD") return "standard";
  return code.toLowerCase();
};

const ratingTypeFromVesus = (tournament = {}, event = {}) => {
  if (tournament.rated === false) return "unrated";
  const text = [event.name, tournament.name, tournament.federation?.code, tournament.federation?.acronym]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (text.includes("fide")) return "FIDE";
  return tournament.rated ? "national" : "";
};

const countryNameFromEvent = (event = {}) => {
  const code = event.country?.code || event.countryCode || "";
  return event.country?.defaultName || countryNames[code] || code || "Italy";
};

const cityFromEvent = (event = {}) => {
  return stripHtml(event.location || event.country?.admin2?.name || event.country?.admin1?.name || countryNameFromEvent(event));
};

const registrationStatusFromVesus = (status) => {
  const value = String(status || "").toUpperCase();
  if (value === "OPEN") return "open";
  if (value === "FULL") return "full";
  return "closed";
};

const eventStatusFromDates = (endDate, timing = "") => {
  if (String(timing).toUpperCase() === "ARCHIVED") return "completed";
  const end = endDate ? new Date(endDate) : null;
  if (end && !Number.isNaN(end.getTime()) && end.getTime() < Date.now()) return "completed";
  return "published";
};

const titleForTournament = (event = {}, tournament = {}) => {
  const eventName = stripHtml(event.name || "Vesus tournament");
  const tournamentName = stripHtml(tournament.name || "");
  if (!tournamentName || tournamentName === eventName) return eventName;
  return `${eventName} - ${tournamentName}`;
};

const mapVesusEventTournament = (event, tournament, { baseUrl = DEFAULT_ENDPOINT, checkedAt = new Date(), timing = "" } = {}) => {
  const startDate = normalizeDate(tournament.start || event.start);
  const endDate = normalizeDate(tournament.end || event.end || tournament.start || event.start);
  const shortKey = tournament.shortKey || tournament.publicShortKey || "";
  const title = titleForTournament(event, tournament);
  const sourceUrl = shortKey ? vesusUrl(`/tournament/${shortKey}`, baseUrl) : "";
  const participantsCount = Number(tournament.participantsCount || tournament.registrationsCounts?.confirmed || 0);
  const rounds = Number(tournament.rounds || 0);
  const timeControl = timeControlFromVesus(tournament.timeControlType);
  const description = compactText(
    [
      rounds ? `${rounds} rounds` : "",
      timeControl,
      tournament.attendanceMode,
      participantsCount ? `${participantsCount} participants` : "",
      event.location
    ]
      .filter(Boolean)
      .join(" - "),
    260
  );

  return {
    title,
    description,
    city: cityFromEvent(event),
    country: countryNameFromEvent(event),
    venue: stripHtml(event.venue || event.location || ""),
    address: stripHtml(event.location || ""),
    startDate,
    endDate,
    status: eventStatusFromDates(endDate, timing),
    registrationStatus: registrationStatusFromVesus(tournament.registrationsStatus?.status),
    timeControl,
    ratingType: ratingTypeFromVesus(tournament, event),
    maxPlayers: Number(event.registrationsLimit || 0),
    contactEmail: event.contactsEmail || "",
    sourceName: SOURCE_NAME,
    sourceUrl,
    registrationUrl: sourceUrl,
    resultsUrl: shortKey ? vesusUrl(`/pairings/${shortKey}`, baseUrl) : sourceUrl,
    regulationsUrl: event.regulation ? mediaUrl(event.regulation, baseUrl) : "",
    originalId: shortKey ? `vesus:tournament:${shortKey}` : `vesus:tournament:${tournament.id || event.id || title}`,
    lastCheckedAt: checkedAt.toISOString(),
    raw: {
      attendanceMode: tournament.attendanceMode || "",
      countryCode: event.country?.code || "",
      eventId: event.id || "",
      eventShortKey: event.shortKey || "",
      participantsCount,
      rounds,
      timing,
      tournamentId: tournament.id || "",
      tournamentShortKey: shortKey,
      vesusRegistrationStatus: tournament.registrationsStatus?.status || ""
    }
  };
};

const graphQlHeaders = ({ baseUrl = DEFAULT_ENDPOINT, language = "en", referer = DEFAULT_ENDPOINT, userAgent = DEFAULT_USER_AGENT } = {}) => ({
  Accept: "application/json",
  "Accept-Encoding": "identity",
  "Client-Language": language,
  "Content-Type": "application/json",
  Origin: baseUrl,
  Referer: referer,
  "User-Agent": userAgent
});

const graphqlJson = async ({
  apiEndpoint = DEFAULT_API_ENDPOINT,
  baseUrl = DEFAULT_ENDPOINT,
  docId,
  language = "en",
  operationName,
  rateLimitMs = 1000,
  referer = DEFAULT_ENDPOINT,
  timeoutMs = 20000,
  userAgent = DEFAULT_USER_AGENT,
  variables = {}
} = {}) => {
  const body = JSON.stringify({ operationName, variables, docId });
  return fetchJson(apiEndpoint, {
    body,
    headers: graphQlHeaders({ baseUrl, language, referer, userAgent }),
    method: "POST",
    rateLimitMs,
    respectRobots: false,
    timeoutMs,
    userAgent
  });
};

const parseSseBlock = (block) => {
  const lines = String(block || "").split(/\r?\n/);
  let event = "";
  const data = [];
  for (const line of lines) {
    if (line.startsWith("event:")) event = line.slice("event:".length).trim();
    if (line.startsWith("data:")) data.push(line.slice("data:".length).replace(/^ /, ""));
  }
  return { event, data: data.join("\n") };
};

const findSseDelimiter = (buffer) => {
  const crlf = buffer.indexOf("\r\n\r\n");
  const lf = buffer.indexOf("\n\n");
  if (crlf === -1) return lf === -1 ? null : { index: lf, length: 2 };
  if (lf === -1) return { index: crlf, length: 4 };
  return crlf < lf ? { index: crlf, length: 4 } : { index: lf, length: 2 };
};

const graphqlSseNext = async ({
  apiEndpoint = DEFAULT_API_ENDPOINT,
  baseUrl = DEFAULT_ENDPOINT,
  body,
  language = "en",
  maxBytes = 20 * 1024 * 1024,
  rateLimitMs = 1000,
  referer = DEFAULT_ENDPOINT,
  timeoutMs = 30000,
  userAgent = DEFAULT_USER_AGENT
} = {}) => {
  await sleep(Math.max(Number(rateLimitMs || 0), 0));

  const endpoint = new URL(apiEndpoint);
  const requestBody = JSON.stringify(body);
  const headers = {
    ...graphQlHeaders({ baseUrl, language, referer, userAgent }),
    Accept: "text/event-stream",
    "Content-Length": Buffer.byteLength(requestBody)
  };

  return new Promise((resolve, reject) => {
    let settled = false;
    let buffer = "";
    let errorBody = "";
    let bytes = 0;

    const finish = (error, value, request) => {
      if (settled) return;
      settled = true;
      if (request) request.destroy();
      if (error) reject(error);
      else resolve(value);
    };

    const request = https.request(
      endpoint,
      {
        headers,
        method: "POST",
        timeout: timeoutMs
      },
      (response) => {
        response.setEncoding("utf8");

        if ((response.statusCode || 0) < 200 || (response.statusCode || 0) >= 300) {
          response.on("data", (chunk) => {
            errorBody += chunk;
          });
          response.on("end", () => {
            finish(
              new Error(`HTTP ${response.statusCode || 0} from ${apiEndpoint}: ${errorBody.slice(0, 200)}`),
              null,
              request
            );
          });
          return;
        }

        response.on("data", (chunk) => {
          bytes += Buffer.byteLength(chunk);
          if (bytes > maxBytes) {
            finish(new Error(`Vesus SSE payload exceeded ${maxBytes} bytes`), null, request);
            return;
          }

          buffer += chunk;
          let delimiter = findSseDelimiter(buffer);
          while (delimiter) {
            const block = buffer.slice(0, delimiter.index);
            buffer = buffer.slice(delimiter.index + delimiter.length);
            const { event, data } = parseSseBlock(block);
            if (event === "next") {
              try {
                finish(null, JSON.parse(data), request);
              } catch (error) {
                finish(new Error(`Unable to parse Vesus SSE payload: ${error.message}`), null, request);
              }
              return;
            }
            if (event === "complete") {
              finish(new Error("Vesus SSE completed without a next payload"), null, request);
              return;
            }
            delimiter = findSseDelimiter(buffer);
          }
        });

        response.on("end", () => {
          finish(new Error("Vesus SSE closed without a next payload"), null, request);
        });
      }
    );

    request.on("timeout", () => {
      finish(new Error(`Vesus SSE timed out after ${timeoutMs}ms`), null, request);
    });
    request.on("error", (error) => {
      if (!settled) reject(error);
    });
    request.end(requestBody);
  });
};

const normalizeTimings = (timings) => {
  if (Array.isArray(timings) && timings.length) return timings.map((timing) => String(timing).toUpperCase());
  if (typeof timings === "string" && timings.trim()) {
    return timings
      .split(",")
      .map((timing) => timing.trim().toUpperCase())
      .filter(Boolean);
  }
  return ["INPROGRESS", "FUTURE", "ARCHIVED"];
};

const listEventsForTiming = async ({
  apiEndpoint,
  baseUrl,
  checkedAt,
  language,
  limit,
  pageSize,
  rateLimitMs,
  timeoutMs,
  timing,
  userAgent
}) => {
  const tournaments = [];
  const skipped = [];
  let after = null;

  while (tournaments.length < limit) {
    const variables = {
      first: Math.min(pageSize, limit - tournaments.length),
      after,
      events: { timing }
    };
    const payload = await graphqlJson({
      apiEndpoint,
      baseUrl,
      ...OPERATIONS.eventsPage,
      language,
      rateLimitMs,
      referer: vesusUrl(`/${timing === "ARCHIVED" ? "archive" : timing === "INPROGRESS" ? "inprogress" : "events"}`, baseUrl),
      timeoutMs,
      userAgent,
      variables
    });

    const edges = normalizeList(payload?.data?.events?.edges);
    for (const edge of edges) {
      const event = edge.node || {};
      for (const tournament of normalizeList(event.tournaments)) {
        const mapped = mapVesusEventTournament(event, tournament, { baseUrl, checkedAt, timing });
        if (mapped.title && mapped.startDate && mapped.sourceUrl) tournaments.push(mapped);
        else skipped.push({ title: event.name || tournament.name || "", sourceUrl: mapped.sourceUrl, id: tournament.id || event.id || "" });
        if (tournaments.length >= limit) break;
      }
      if (tournaments.length >= limit) break;
    }

    if (!payload?.data?.events?.pageInfo?.hasNextPage || !payload.data.events.pageInfo.endCursor) break;
    after = payload.data.events.pageInfo.endCursor;
  }

  return { tournaments, skipped };
};

const searchVesusTournaments = async ({
  apiEndpoint = DEFAULT_API_ENDPOINT,
  baseUrl = DEFAULT_ENDPOINT,
  language = "en",
  limit = 25,
  pageSize = 20,
  rateLimitMs = 1000,
  timings,
  timeoutMs = 20000,
  userAgent = DEFAULT_USER_AGENT
} = {}) => {
  const checkedAt = new Date();
  const max = Math.max(Number(limit || 25), 1);
  const seen = new Set();
  const tournaments = [];
  const skipped = [];
  const timingList = normalizeTimings(timings);

  for (const timing of timingList) {
    if (tournaments.length >= max) break;
    const result = await listEventsForTiming({
      apiEndpoint,
      baseUrl,
      checkedAt,
      language,
      limit: max - tournaments.length,
      pageSize: Math.min(Math.max(Number(pageSize || 20), 1), 20),
      rateLimitMs,
      timeoutMs,
      timing,
      userAgent
    });

    for (const tournament of result.tournaments) {
      if (seen.has(tournament.originalId)) continue;
      seen.add(tournament.originalId);
      tournaments.push(tournament);
    }
    skipped.push(...result.skipped);
  }

  return {
    sourceName: SOURCE_NAME,
    sourceUrl: baseUrl,
    tournaments,
    skipped,
    warnings: tournaments.length ? [] : ["Vesus returned no importable public tournaments."]
  };
};

const shortKeyFromUrl = (sourceUrl = "") => {
  try {
    const match = new URL(sourceUrl).pathname.match(/^\/(?:event|tournament|pairings)\/([^/]+)/);
    return match?.[1] || "";
  } catch {
    return "";
  }
};

const cleanFideId = (value) => {
  const text = String(value || "").trim();
  if (!text || text === "-2") return "";
  return text;
};

const ratingForPlayer = (player = {}) => Number(player.fideRating || player.nationalRating || 0);

const numberOrNull = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const integerOrZero = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : 0;
};

const birthYearFromVesus = (value) => {
  const match = String(value || "").match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
};

const cleanStringList = (value) => normalizeList(value).map((item) => String(item || "").trim()).filter(Boolean);

const mapVesusPlayer = (player = {}) => ({
  name: stripHtml(player.name || `Player ${player.rankedId || ""}`),
  federation: player.federation || "",
  club: player.origin || "",
  rating: ratingForPlayer(player),
  fideId: cleanFideId(player.fideId),
  title: player.title || "",
  gender: player.gender || "",
  nationalId: player.nationalId || "",
  nationalRating: Number(player.nationalRating || 0),
  fideK: Number(player.fideK || 0),
  nationalK: Number(player.nationalK || 0),
  performanceRating: Number(player.performanceRating || 0),
  ratingChange: numberOrNull(player.ratingChange),
  rank: Number(player.rank || 0),
  points: Number(player.points || 0),
  rankedId: Number(player.rankedId || 0),
  birthYear: birthYearFromVesus(player.birthDate),
  tieBreaks: cleanStringList(player.tieBreaks),
  matches: cleanStringList(player.matches),
  status: player.expelled ? "withdrawn" : "active",
  externalId: `vesus:player:${player.id || player.rankedId || player.name || ""}`
});

const normalizeVesusResult = (result) =>
  String(result || "")
    .replace(/\u00bd/g, "1/2")
    .replace(/½/g, "1/2")
    .replace(/\s+/g, "");

const roundStatus = (roundNumber, tournament = {}, pairings = []) => {
  if (roundNumber <= Number(tournament.completedPublishedRounds || 0)) return "completed";
  if (pairings.some((pairing) => normalizeVesusResult(pairing.result))) return "completed";
  return roundNumber <= Number(tournament.publishedRounds || tournament.pairedRounds || 0) ? "published" : "draft";
};

const mapVesusPairing = (pairing = {}, playersByRankedId = new Map()) => {
  const whiteId = Number(pairing.whiteId);
  const blackId = Number(pairing.blackId);
  const white = playersByRankedId.get(whiteId);
  const black = playersByRankedId.get(blackId);
  const hasBlack = blackId > 0;

  if (!white || (hasBlack && !black)) return null;

  return {
    boardNumber: Number(pairing.board || 0),
    result: normalizeVesusResult(pairing.result),
    externalId: `vesus:pairing:${pairing.id || `${pairing.round}:${pairing.board}`}`,
    sourceWhitePoints: numberOrNull(pairing.whitePoints),
    sourceBlackPoints: numberOrNull(pairing.blackPoints),
    white: {
      ...(white || {}),
      externalId: white.externalId || `vesus:ranked:${whiteId}`,
      name: white.name
    },
    black: hasBlack
      ? {
          ...black,
          externalId: black.externalId || `vesus:ranked:${blackId}`
        }
      : null
  };
};

const timeControlLabel = (timeControl) => {
  const period = normalizeList(timeControl?.periods)[0];
  const white = period?.white || {};
  if (Number.isFinite(Number(white.minutes))) {
    const increment = Number.isFinite(Number(white.increment)) ? Number(white.increment) : 0;
    return increment ? `${white.minutes}+${increment}` : String(white.minutes);
  }
  return String(timeControl?.legacy || "");
};

const vesusEventMetadata = (tournament = {}, { baseUrl = DEFAULT_ENDPOINT, sourceUrl = "" } = {}) => {
  const event = tournament.event || {};
  const shortKey = tournament.shortKey || shortKeyFromUrl(sourceUrl);
  const regulationsUrl = event.regulation ? mediaUrl(event.regulation, baseUrl) : "";
  const detailParts = [
    tournament.pairingSystem ? `Pairing: ${tournament.pairingSystem}` : "",
    tournament.scoringSystem ? `Scoring: ${tournament.scoringSystem}` : "",
    tournament.playersTieBreaks?.length ? `Tie-breaks: ${tournament.playersTieBreaks.join(", ")}` : "",
    tournament.resultsSource ? `Results source: ${tournament.resultsSource}` : ""
  ].filter(Boolean);

  return {
    contactEmail: event.contactsEmail || "",
    contactPhone: event.contactsPhone || "",
    sourceOrganizerName: event.organiser || "",
    venueName: stripHtml(event.venue || ""),
    address: stripHtml(event.venue || event.location || ""),
    websiteUrl: event.url || "",
    resultsUrl: shortKey ? vesusUrl(`/pairings/${shortKey}`, baseUrl) : sourceUrl,
    regulationsUrl,
    maxPlayers: Number(event.registrationsLimit || 0),
    timeControl: timeControlLabel(tournament.timeControl) || timeControlFromVesus(tournament.timeControlType),
    description: compactText(detailParts.join(" - "), 320)
  };
};

const documentsForVesusTournament = (tournament = {}, { baseUrl = DEFAULT_ENDPOINT, sourceUrl = "" } = {}) => {
  const event = tournament.event || {};
  const shortKey = tournament.shortKey || shortKeyFromUrl(sourceUrl);
  const documents = [
    sourceUrl
      ? {
          label: "Vesus tournament page",
          type: "source",
          url: sourceUrl,
          originalId: `vesus:source:${shortKey}`
        }
      : null,
    shortKey
      ? {
          label: "Vesus pairings and standings",
          type: "results",
          url: vesusUrl(`/pairings/${shortKey}`, baseUrl),
          originalId: `vesus:pairings:${shortKey}`
        }
      : null,
    event.shortKey
      ? {
          label: "Vesus event page",
          type: "source",
          url: vesusUrl(`/event/${event.shortKey}`, baseUrl),
          originalId: `vesus:event:${event.shortKey}`
        }
      : null,
    event.regulation
      ? {
          label: "Vesus regulation",
          type: "regulations",
          url: mediaUrl(event.regulation, baseUrl),
          originalId: `vesus:regulation:${event.regulation}`
        }
      : null,
    event.url
      ? {
          label: "Official event website",
          type: "website",
          url: event.url,
          originalId: `vesus:event-url:${event.url}`
        }
      : null,
    tournament.chessResultsId
      ? {
          label: "Chess-Results page",
          type: "results",
          url: `https://chess-results.com/tnr${tournament.chessResultsId}.aspx`,
          originalId: `vesus:chess-results:${tournament.chessResultsId}`
        }
      : null,
    ...normalizeList(event.links).map((url, index) => ({
      label: "Vesus event link",
      type: "website",
      url,
      originalId: `vesus:event-link:${index}:${url}`
    }))
  ].filter(Boolean);

  return uniqueByUrl(documents);
};

const mapVesusPairingsSnapshot = (tournament = {}, { baseUrl = DEFAULT_ENDPOINT, checkedAt = new Date(), sourceUrl = "" } = {}) => {
  const playerRows = normalizeList(tournament.pairingsPlayers).map(mapVesusPlayer);
  const sourcePlayersByRankedId = new Map(
    normalizeList(tournament.pairingsPlayers).map((player, index) => [Number(player.rankedId || index + 1), playerRows[index]])
  );
  const pairingsByRound = new Map();

  for (const pairing of normalizeList(tournament.pairings)) {
    const roundNumber = Number(pairing.round || 0);
    if (!roundNumber) continue;
    if (!pairingsByRound.has(roundNumber)) pairingsByRound.set(roundNumber, []);
    const mappedPairing = mapVesusPairing(pairing, sourcePlayersByRankedId);
    if (mappedPairing) pairingsByRound.get(roundNumber).push(mappedPairing);
  }

  const roundsCount = Number(tournament.rounds || Math.max(0, ...pairingsByRound.keys()));
  const rounds = Array.from({ length: roundsCount }, (_, index) => {
    const number = index + 1;
    const pairings = (pairingsByRound.get(number) || []).sort((a, b) => a.boardNumber - b.boardNumber);
    return {
      number,
      name: `Round ${number}`,
      status: roundStatus(number, tournament, pairings),
      externalId: `vesus:round:${tournament.shortKey || ""}:${number}`,
      pairings
    };
  });

  return {
    sourceName: SOURCE_NAME,
    checkedAt: checkedAt.toISOString(),
    sectionName: tournament.name || "Open",
    sections: [
      {
        name: tournament.name || "Open",
        timeControl: timeControlLabel(tournament.timeControl) || timeControlFromVesus(tournament.timeControlType),
        roundsCount,
        pairingSystem: tournament.pairingSystem || "",
        scoringSystem: tournament.scoringSystem || "",
        ratingRule: tournament.ratingRule || "",
        resultsSource: tournament.resultsSource || "",
        tieBreaks: cleanStringList(tournament.playersTieBreaks),
        tieBreakRating: integerOrZero(tournament.tieBreakRating),
        externalId: `vesus:section:${tournament.shortKey || tournament.id || "open"}`,
        players: playerRows,
        rounds
      }
    ],
    players: [],
    rounds: [],
    documents: documentsForVesusTournament(tournament, { baseUrl, sourceUrl }),
    eventMetadata: vesusEventMetadata(tournament, { baseUrl, sourceUrl }),
    sourceUrl
  };
};

const fetchPairingsSnapshot = async ({
  apiEndpoint = DEFAULT_API_ENDPOINT,
  baseUrl = DEFAULT_ENDPOINT,
  language = "en",
  rateLimitMs = 1000,
  shortKey,
  timeoutMs = 30000,
  userAgent = DEFAULT_USER_AGENT
} = {}) => {
  const payload = await graphqlSseNext({
    apiEndpoint,
    baseUrl,
    body: {
      ...OPERATIONS.pairingsSubscription,
      variables: { shortKey }
    },
    language,
    rateLimitMs,
    referer: vesusUrl(`/pairings/${shortKey}`, baseUrl),
    timeoutMs,
    userAgent
  });
  return payload?.payload || payload;
};

const fetchPairingsFallback = async ({
  apiEndpoint = DEFAULT_API_ENDPOINT,
  baseUrl = DEFAULT_ENDPOINT,
  language = "en",
  rateLimitMs = 1000,
  shortKey,
  timeoutMs = 30000,
  userAgent = DEFAULT_USER_AGENT
} = {}) => {
  const [tournamentPage, pairingsPage] = await Promise.all([
    graphqlJson({
      apiEndpoint,
      baseUrl,
      ...OPERATIONS.tournamentPage,
      language,
      rateLimitMs,
      referer: vesusUrl(`/tournament/${shortKey}`, baseUrl),
      timeoutMs,
      userAgent,
      variables: { shortKey }
    }),
    graphqlJson({
      apiEndpoint,
      baseUrl,
      ...OPERATIONS.pairingsPage,
      language,
      rateLimitMs,
      referer: vesusUrl(`/pairings/${shortKey}`, baseUrl),
      timeoutMs,
      userAgent,
      variables: { shortKey }
    })
  ]);
  return {
    data: {
      tournamentUpdate: {
        ...(pairingsPage?.data?.tournament || {}),
        ...(tournamentPage?.data?.tournament || {}),
        event: {
          ...(pairingsPage?.data?.tournament?.event || {}),
          ...(tournamentPage?.data?.tournament?.event || {})
        },
        pairingsPlayers: [],
        pairings: []
      }
    }
  };
};

const fetchVesusTournamentDetail = async ({
  apiEndpoint = DEFAULT_API_ENDPOINT,
  baseUrl = DEFAULT_ENDPOINT,
  language = "en",
  rateLimitMs = 1000,
  shortKey,
  sourceUrl,
  timeoutMs = 30000,
  userAgent = DEFAULT_USER_AGENT
} = {}) => {
  const resolvedShortKey = shortKey || shortKeyFromUrl(sourceUrl);
  if (!resolvedShortKey) throw new Error(`Unable to resolve Vesus tournament shortKey from ${sourceUrl || ""}`);

  let payload;
  try {
    payload = await fetchPairingsSnapshot({
      apiEndpoint,
      baseUrl,
      language,
      rateLimitMs,
      shortKey: resolvedShortKey,
      timeoutMs,
      userAgent
    });
  } catch {
    payload = await fetchPairingsFallback({
      apiEndpoint,
      baseUrl,
      language,
      rateLimitMs,
      shortKey: resolvedShortKey,
      timeoutMs,
      userAgent
    });
  }

  const tournament = payload?.data?.tournamentUpdate || payload?.data?.tournament;
  if (!tournament) throw new Error(`Vesus returned no tournament detail for ${resolvedShortKey}`);

  return mapVesusPairingsSnapshot(tournament, {
    baseUrl,
    checkedAt: new Date(),
    sourceUrl: sourceUrl || vesusUrl(`/tournament/${resolvedShortKey}`, baseUrl)
  });
};

module.exports = {
  DEFAULT_API_ENDPOINT,
  DEFAULT_ENDPOINT,
  OPERATIONS,
  SOURCE_NAME,
  fetchVesusTournamentDetail,
  mapVesusEventTournament,
  mapVesusPairingsSnapshot,
  searchVesusTournaments,
  shortKeyFromUrl
};
