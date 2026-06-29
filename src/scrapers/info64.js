const cheerio = require("cheerio");
const { fetchFormJson, fetchText } = require("./httpClient");
const { compactText, inferRatingType, inferTimeControl, parseIsoDateRange, stripHtml } = require("./tournamentUtils");

const SOURCE_NAME = "Info64";
const DEFAULT_ENDPOINT = "https://info64.org";

const absoluteUrl = (href, base = DEFAULT_ENDPOINT) => new URL(href, base).toString();

const isTournamentHref = (href) => {
  const clean = String(href || "");
  if (!clean || clean.startsWith("#")) return false;
  if (/^\/?(calendar|search|team|player|players|games|information|login|descargas|documentacion)/i.test(clean)) {
    return false;
  }
  return /^\/[a-z0-9][a-z0-9-]+$/i.test(clean);
};

const discoverInfo64Links = (html, { endpoint = DEFAULT_ENDPOINT, limit = 25 } = {}) => {
  const $ = cheerio.load(html);
  const seen = new Set();
  const links = [];

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href") || "";
    const title = stripHtml($(element).text());
    if (!title || !isTournamentHref(href)) return;
    const url = absoluteUrl(href, endpoint);
    if (seen.has(url)) return;
    seen.add(url);
    links.push({ title, url });
  });

  return links.slice(0, Math.max(Number(limit || 25), 1));
};

const officialWebsiteFrom = ($) => {
  const links = $("a[href]")
    .map((_, element) => ({
      href: $(element).attr("href") || "",
      text: stripHtml($(element).text())
    }))
    .get();
  const official = links.find((link) => /official website/i.test(link.text));
  return official?.href ? absoluteUrl(official.href) : "";
};

const headerMapFor = ($, table) => {
  const headers = $(table)
    .find("tr")
    .first()
    .children("th,td")
    .map((_, cell) =>
      stripHtml($(cell).text())
        .replace(/\./g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase()
    )
    .get();

  return headers.reduce((map, header, index) => {
    map[header] = index;
    return map;
  }, {});
};

const cellsFor = ($, row) =>
  $(row)
    .children("td,th")
    .map((_, cell) => stripHtml($(cell).text()).replace(/\s+/g, " ").trim())
    .get();

const playerFromCells = (cells, headers) => {
  const nameIndex = headers.name ?? -1;
  if (nameIndex < 0 || !cells[nameIndex]) return null;
  return {
    name: cells[nameIndex],
    title: cells[headers.tit] || "",
    federation: cells[headers.fed] || "",
    rating: Number(cells[headers.fide] || 0),
    fideId: cells[headers["fide id"]] || "",
    rank: Number(cells[headers.ran] || 0),
    externalId: `info64:player:${cells[nameIndex].toLowerCase()}`
  };
};

const normalizePlayerKey = (value) =>
  String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const parseInfo64Players = (html) => {
  const $ = cheerio.load(html);
  const players = [];

  $("table").each((_, table) => {
    const headers = headerMapFor($, table);
    if (headers.name === undefined || headers.ran === undefined || headers.fed === undefined) return;

    $(table)
      .find("tr")
      .slice(1)
      .each((__, row) => {
        const player = playerFromCells(cellsFor($, row), headers);
        if (player) players.push(player);
      });
  });

  return players;
};

const parseInfo64Standings = (html) => {
  const $ = cheerio.load(html);
  const standings = [];

  $("table").each((_, table) => {
    const headers = headerMapFor($, table);
    if (headers.name === undefined || headers.pos === undefined || headers.pts === undefined) return;

    $(table)
      .find("tr")
      .slice(1)
      .each((__, row) => {
        const cells = cellsFor($, row);
        const name = cells[headers.name] || "";
        if (!name) return;
        standings.push({
          name,
          title: cells[headers.tit] || "",
          federation: cells[headers.fed] || "",
          rating: Number(cells[headers.fide] || 0),
          rank: Number(cells[headers.pos] || 0),
          points: Number(cells[headers.pts] || 0),
          externalId: `info64:player:${name.toLowerCase()}`
        });
      });
  });

  return standings;
};

const mergePlayersWithStandings = (players, standings) => {
  if (!standings.length) return players;
  const byKey = new Map(players.map((player) => [normalizePlayerKey(player.name), { ...player }]));

  for (const standing of standings) {
    const key = normalizePlayerKey(standing.name);
    const existing = byKey.get(key) || {};
    byKey.set(key, {
      ...existing,
      ...standing,
      name: existing.name || standing.name,
      rating: existing.rating || standing.rating,
      federation: existing.federation || standing.federation,
      fideId: existing.fideId || standing.fideId || ""
    });
  }

  return [...byKey.values()];
};

const parseInfo64Stats = (html) => {
  const $ = cheerio.load(html);
  const stats = {};

  $("table")
    .first()
    .find("tr")
    .each((_, row) => {
      const cells = cellsFor($, row);
      if (cells.length < 2) return;
      const key = cells[0].toLowerCase();
      if (key.includes("number of rounds")) stats.roundsCount = Number(cells[1] || 0);
      if (key.includes("rate of play")) stats.timeControlText = cells[1] || "";
      if (key === "name") stats.name = cells[1] || "";
    });

  return stats;
};

const playerFromRoundSide = ({ name, federation, rating, rank }) => ({
  name,
  federation,
  rating: Number(rating || 0),
  rank: Number(rank || 0),
  externalId: `info64:player:${String(name || "").toLowerCase()}`
});

const parseInfo64RoundPairings = (html) => {
  const $ = cheerio.load(html);
  const pairings = [];

  $("table").each((_, table) => {
    const headers = headerMapFor($, table);
    if (headers.brd === undefined || headers.white === undefined || headers.res === undefined || headers.black === undefined) {
      return;
    }

    $(table)
      .find("tr")
      .slice(1)
      .each((__, row) => {
        const cells = cellsFor($, row);
        const whiteName = cells[1] || "";
        const blackName = cells[7] || "";
        if (!whiteName) return;
        pairings.push({
          boardNumber: Number(cells[0] || pairings.length + 1),
          white: playerFromRoundSide({
            name: whiteName,
            rank: cells[2],
            rating: cells[4],
            federation: cells[5]
          }),
          black: blackName
            ? playerFromRoundSide({
                name: blackName,
                rank: cells[8],
                rating: cells[10],
                federation: cells[11]
              })
            : null,
          result: cells[6] || "",
          externalId: `info64:pairing:${cells[0] || pairings.length + 1}:${whiteName}:${blackName}`
        });
      });
  });

  return pairings;
};

const discoverInfo64TournamentLinks = (html, sourceUrl) => {
  const $ = cheerio.load(html);
  const basePath = new URL(sourceUrl).pathname.replace(/\/$/, "");
  const links = {
    rounds: [],
    standings: "",
    crosstable: "",
    games: "",
    stats: ""
  };
  const seenRounds = new Set();

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href") || "";
    const text = stripHtml($(element).text());
    const absolute = absoluteUrl(href, sourceUrl);
    const pathname = new URL(absolute).pathname.replace(/\/$/, "");
    const roundMatch = pathname.match(new RegExp(`^${basePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\/(\\d+)$`));

    if (roundMatch && !seenRounds.has(roundMatch[1])) {
      seenRounds.add(roundMatch[1]);
      links.rounds.push({
        number: Number(roundMatch[1]),
        name: text || `Round ${roundMatch[1]}`,
        url: absolute
      });
    }
    if (pathname === `${basePath}/standings`) links.standings = absolute;
    if (pathname === `${basePath}/crosstable`) links.crosstable = absolute;
    if (pathname === `${basePath}/games`) links.games = absolute;
    if (pathname === `${basePath}/stats`) links.stats = absolute;
  });

  links.rounds.sort((left, right) => left.number - right.number);
  return links;
};

const fetchInfo64ExportDocuments = async (sourceUrl, options = {}) => {
  const documents = [];
  const url = new URL(sourceUrl);
  for (const exportType of ["xls", "pdf"]) {
    try {
      const payload = await fetchFormJson(new URL(`${url.pathname}/${exportType}`, url.origin), {}, options);
      if (payload?.url) {
        documents.push({
          label: exportType === "xls" ? "Info64 Excel export" : "Info64 PDF export",
          type: exportType === "xls" ? "excel" : "pdf",
          url: absoluteUrl(payload.url, sourceUrl),
          originalId: `info64:export:${exportType}:${url.pathname}`
        });
      }
    } catch (error) {
      documents.push({
        label: `Info64 ${exportType.toUpperCase()} export failed`,
        type: "other",
        url: sourceUrl,
        error: error.message,
        originalId: `info64:export:${exportType}:failed:${url.pathname}`
      });
    }
  }
  return documents.filter((document) => document.url && !document.error);
};

const mapInfo64Detail = (html, { checkedAt = new Date(), sourceUrl, fallbackTitle = "" } = {}) => {
  const $ = cheerio.load(html);
  const title = stripHtml($("h1").first().text()) || fallbackTitle || stripHtml($("title").text()).replace(/ - info64\.org$/i, "");
  const text = stripHtml($("body").text() || $.root().text());
  const titleIndex = title ? text.lastIndexOf(title) : -1;
  const afterTitle = titleIndex >= 0 ? text.slice(titleIndex + title.length).trim() : text;
  const locationMatch = afterTitle.match(/^(.+?),\s+from\s+/i);
  const location = stripHtml(locationMatch?.[1] || "");
  const city = location.split("(")[0].split(",")[0].trim() || "Spain";
  const { startDate, endDate } = parseIsoDateRange(text);
  const sourceOfficialUrl = officialWebsiteFrom($);

  return {
    title,
    description: compactText(afterTitle || text, 260),
    city,
    country: "Spain",
    venue: location || city,
    address: location,
    startDate,
    endDate,
    timeControl: inferTimeControl(text),
    ratingType: inferRatingType(text) || "FIDE",
    sourceName: SOURCE_NAME,
    sourceUrl,
    registrationUrl: sourceOfficialUrl || sourceUrl,
    resultsUrl: sourceUrl,
    originalId: `info64:tournament:${new URL(sourceUrl).pathname.replace(/^\/+/, "")}`,
    lastCheckedAt: checkedAt.toISOString()
  };
};

const searchInfo64Tournaments = async ({
  endpoint = DEFAULT_ENDPOINT,
  limit = 25,
  rateLimitMs = 1500,
  respectRobots = true,
  timeoutMs = 20000,
  userAgent
} = {}) => {
  const checkedAt = new Date();
  const html = await fetchText(endpoint, { rateLimitMs, respectRobots, timeoutMs, userAgent });
  const links = discoverInfo64Links(html, { endpoint, limit });
  const tournaments = [];
  const warnings = [];

  for (const link of links) {
    try {
      const detailHtml = await fetchText(link.url, { rateLimitMs, respectRobots, timeoutMs, userAgent });
      const tournament = mapInfo64Detail(detailHtml, {
        checkedAt,
        fallbackTitle: link.title,
        sourceUrl: link.url
      });
      if (tournament.title && tournament.startDate && tournament.sourceUrl) {
        tournaments.push(tournament);
      } else {
        warnings.push(`Info64 skipped ${link.url} because required metadata was missing.`);
      }
    } catch (error) {
      warnings.push(`Info64 skipped ${link.url}: ${error.message}`);
    }
  }

  return {
    sourceName: SOURCE_NAME,
    sourceUrl: endpoint,
    tournaments: tournaments.slice(0, Math.max(Number(limit || 25), 1)),
    warnings
  };
};

const fetchInfo64TournamentDetail = async ({
  sourceUrl,
  rateLimitMs = 1500,
  respectRobots = true,
  timeoutMs = 20000,
  userAgent,
  exportDocuments = true
} = {}) => {
  const checkedAt = new Date();
  const html = await fetchText(sourceUrl, { rateLimitMs, respectRobots, timeoutMs, userAgent });
  const links = discoverInfo64TournamentLinks(html, sourceUrl);
  const stats = links.stats
    ? parseInfo64Stats(await fetchText(links.stats, { rateLimitMs, respectRobots, timeoutMs, userAgent }))
    : {};
  const players = parseInfo64Players(html);
  const standings = links.standings
    ? parseInfo64Standings(await fetchText(links.standings, { rateLimitMs, respectRobots, timeoutMs, userAgent }))
    : [];
  const rounds = [];

  for (const roundLink of links.rounds) {
    const roundHtml = await fetchText(roundLink.url, { rateLimitMs, respectRobots, timeoutMs, userAgent });
    rounds.push({
      number: roundLink.number,
      name: roundLink.name || `Round ${roundLink.number}`,
      status: "completed",
      externalId: `info64:round:${new URL(roundLink.url).pathname}`,
      pairings: parseInfo64RoundPairings(roundHtml)
    });
  }

  const documents = [
    links.standings ? { label: "Info64 standings", type: "results", url: links.standings } : null,
    links.crosstable ? { label: "Info64 crosstable", type: "results", url: links.crosstable } : null,
    links.games ? { label: "Info64 games", type: "results", url: links.games } : null,
    links.stats ? { label: "Info64 statistics", type: "results", url: links.stats } : null,
    ...(exportDocuments
      ? await fetchInfo64ExportDocuments(sourceUrl, { rateLimitMs, respectRobots, timeoutMs, userAgent })
      : [])
  ].filter(Boolean);

  return {
    sourceName: SOURCE_NAME,
    checkedAt: checkedAt.toISOString(),
    sectionName: "Open",
    sections: [
      {
        name: "Open",
        roundsCount: stats.roundsCount || rounds.length,
        timeControl: inferTimeControl(stats.timeControlText || "")
      }
    ],
    players: mergePlayersWithStandings(players, standings),
    rounds,
    documents,
    sourceUrl
  };
};

module.exports = {
  SOURCE_NAME,
  discoverInfo64Links,
  discoverInfo64TournamentLinks,
  fetchInfo64TournamentDetail,
  mapInfo64Detail,
  parseInfo64Players,
  parseInfo64RoundPairings,
  parseInfo64Standings,
  parseInfo64Stats,
  searchInfo64Tournaments
};
