const cheerio = require("cheerio");
const { fetchText } = require("./httpClient");
const { compactText, inferRatingType, inferTimeControl, parseIsoDateRange, stripHtml } = require("./tournamentUtils");

const SOURCE_NAME = "ChessArbiter";
const DEFAULT_ENDPOINT = "https://www.chessarbiter.com/turnieje.php";

const POLISH_MONTHS = {
  stycz: 1,
  styczen: 1,
  stycznia: 1,
  luty: 2,
  lutego: 2,
  marzec: 3,
  marca: 3,
  kwiecien: 4,
  kwietnia: 4,
  maj: 5,
  maja: 5,
  czerwiec: 6,
  czerwca: 6,
  lipiec: 7,
  lipca: 7,
  sierpien: 8,
  sierpnia: 8,
  wrzesien: 9,
  wrzesnia: 9,
  pazdziernik: 10,
  pazdziernika: 10,
  listopad: 11,
  listopada: 11,
  grudzien: 12,
  grudnia: 12
};

const absoluteUrl = (href, base = DEFAULT_ENDPOINT) => new URL(href, base).toString();

const normalizePolishText = (value) =>
  stripHtml(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const normalizeEndpoint = (endpoint = DEFAULT_ENDPOINT) => {
  const url = new URL(endpoint, DEFAULT_ENDPOINT);
  if (!url.pathname || url.pathname === "/") {
    url.pathname = "/turnieje.php";
  }
  return url.toString();
};

const dateFromParts = (year, month, day) => {
  const resolvedYear = Number(year);
  const resolvedMonth = Number(month);
  const resolvedDay = Number(day);
  if (!resolvedYear || !resolvedMonth || !resolvedDay) return "";
  const date = new Date(Date.UTC(resolvedYear, resolvedMonth - 1, resolvedDay, 12, 0, 0));
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
};

const parseMonthYear = (value) => {
  const text = normalizePolishText(value);
  const year = Number(text.match(/\b(20\d{2})\b/)?.[1] || 0);
  const monthKey = Object.keys(POLISH_MONTHS).find((key) => text.includes(key));
  return {
    month: POLISH_MONTHS[monthKey] || 0,
    year
  };
};

const parseDateRangeFromCell = (value, fallbackYear) => {
  const pairs = stripHtml(value).match(/(\d{1,2})-(\d{1,2})/g) || [];
  if (!pairs.length) return { startDate: "", endDate: "" };
  const [startDay, startMonth] = pairs[0].split("-").map(Number);
  let [endDay, endMonth] = (pairs[1] || pairs[0]).split("-").map(Number);
  let endYear = Number(fallbackYear);
  if (endMonth < startMonth) endYear += 1;
  return {
    startDate: dateFromParts(fallbackYear, startMonth, startDay),
    endDate: dateFromParts(endYear, endMonth, endDay)
  };
};

const inferChessArbiterTimeControl = (value) => {
  const text = normalizePolishText(value);
  if (text.includes("blyskawiczne") || text.includes("blitz")) return "blitz";
  if (text.includes("szybkie") || text.includes("rapid")) return "rapid";
  if (text.includes("klasyczne") || text.includes("standard")) return "standard";
  return inferTimeControl(value);
};

const isLikelyChessTournament = ({ title = "", details = "" } = {}) => {
  const text = normalizePolishText(`${title} ${details}`);
  if (/\b(kurs|sedziowski|szkolenie|wyklad)\b/.test(text)) return false;
  if (/\b(inne)\b/.test(text) && !/\b(turniej|mistrzostw|open|grand prix|memorial|puchar|festiwal|liga)\b/.test(text)) {
    return false;
  }
  return /\b(turniej|mistrzostw|open|grand prix|memorial|puchar|festiwal|liga|szach|chess|klasyczne|szybkie|blyskawiczne)\b/.test(
    text
  );
};

const mapChessArbiterCalendarRow = ($, row, { checkedAt = new Date(), sourceUrl, monthYear = {} } = {}) => {
  const cells = $(row).children("td");
  if (cells.length < 3) return null;

  const titleCell = cells.eq(1);
  const detailsCell = cells.eq(2);
  const anchor = titleCell.find("a[href]").first();
  const href = anchor.attr("href") || "";
  const title = stripHtml(anchor.text());
  if (!title || !/turnieje\/open\.php/i.test(href)) return null;

  const resolvedSourceUrl = absoluteUrl(href, sourceUrl);
  const dateRange = parseDateRangeFromCell(cells.eq(0).text(), monthYear.year);
  const city = stripHtml(titleCell.find(".szary").first().text())
    .replace(/\s*\[.+$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const details = stripHtml(detailsCell.text());
  if (!dateRange.startDate || !isLikelyChessTournament({ title, details })) return null;

  const turnId = new URL(resolvedSourceUrl).searchParams.get("turn") || new URL(resolvedSourceUrl).pathname;

  return {
    title,
    description: compactText(`${title} ${city} ${details}`, 260),
    city: city || "Poland",
    country: "Poland",
    venue: city || "Poland",
    address: city,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate || dateRange.startDate,
    timeControl: inferChessArbiterTimeControl(details),
    ratingType: inferRatingType(details) || (normalizePolishText(details).includes("pzszach") ? "national" : "national"),
    sourceName: SOURCE_NAME,
    sourceUrl: resolvedSourceUrl,
    registrationUrl: resolvedSourceUrl,
    resultsUrl: resolvedSourceUrl,
    originalId: `chessarbiter:tournament:${turnId.replace(/^\/|\/$/g, "")}`,
    lastCheckedAt: checkedAt.toISOString()
  };
};

const discoverChessArbiterLinks = (html, { endpoint = DEFAULT_ENDPOINT, limit = 25 } = {}) => {
  const $ = cheerio.load(html);
  const seen = new Set();
  const links = [];

  $("table").each((_, table) => {
    const monthYear = parseMonthYear($(table).find("th").first().text());
    if (!monthYear.year || !monthYear.month) return;

    $(table)
      .find("tr")
      .each((__, row) => {
        const tournament = mapChessArbiterCalendarRow($, row, {
          monthYear,
          sourceUrl: endpoint
        });
        if (!tournament || seen.has(tournament.sourceUrl)) return;
        seen.add(tournament.sourceUrl);
        links.push(tournament);
      });
  });

  if (links.length) return links.slice(0, Math.max(Number(limit || 25), 1));

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href") || "";
    if (!/\/turnieje\/20\d{2}\/ti_\d+\/?$/i.test(href)) return;
    const url = absoluteUrl(href, endpoint);
    if (seen.has(url)) return;
    seen.add(url);
    links.push({
      title: stripHtml($(element).text()),
      url
    });
  });

  return links.slice(0, Math.max(Number(limit || 25), 1));
};

const mapChessArbiterDetail = (html, { checkedAt = new Date(), fallbackTitle = "", sourceUrl } = {}) => {
  const $ = cheerio.load(html);
  const pageTitle = stripHtml($("title").text()).replace(/\s+\[TOURNAMENT'S INFORMATION\]$/i, "");
  const title = pageTitle || fallbackTitle;
  const text = stripHtml($("body").text() || $.root().text());
  const dates = parseIsoDateRange(text);
  const afterTitle = title ? text.slice(text.indexOf(title) + title.length).trim() : text;
  const cityMatch = afterTitle.match(/^(.+?)\s+\d{4}-\d{2}-\d{2}/);
  const city = stripHtml(cityMatch?.[1] || "").split(/\s{2,}/)[0].trim() || "Poland";

  return {
    title,
    description: compactText(text, 260),
    city,
    country: "Poland",
    venue: city,
    address: city,
    startDate: dates.startDate,
    endDate: dates.endDate,
    timeControl: inferTimeControl(text),
    ratingType: inferRatingType(text) || "national",
    sourceName: SOURCE_NAME,
    sourceUrl,
    registrationUrl: sourceUrl,
    resultsUrl: sourceUrl,
    originalId: `chessarbiter:tournament:${new URL(sourceUrl).pathname.replace(/^\/|\/$/g, "")}`,
    lastCheckedAt: checkedAt.toISOString()
  };
};

const searchChessArbiterTournaments = async ({
  endpoint = DEFAULT_ENDPOINT,
  limit = 25,
  rateLimitMs = 1500,
  respectRobots = true,
  timeoutMs = 20000,
  userAgent
} = {}) => {
  const checkedAt = new Date();
  const sourceUrl = normalizeEndpoint(endpoint);
  const html = await fetchText(sourceUrl, { rateLimitMs, respectRobots, timeoutMs, userAgent });
  const links = discoverChessArbiterLinks(html, { endpoint: sourceUrl, limit });
  const tournaments = [];
  const warnings = [];

  for (const link of links) {
    if (link.startDate) {
      tournaments.push({
        ...link,
        lastCheckedAt: checkedAt.toISOString()
      });
      continue;
    }

    try {
      const detailHtml = await fetchText(link.url, { rateLimitMs, respectRobots, timeoutMs, userAgent });
      const tournament = mapChessArbiterDetail(detailHtml, {
        checkedAt,
        fallbackTitle: link.title,
        sourceUrl: link.url
      });
      if (tournament.title && tournament.startDate && tournament.sourceUrl) {
        tournaments.push(tournament);
      } else {
        warnings.push(`ChessArbiter skipped ${link.url} because required metadata was missing.`);
      }
    } catch (error) {
      warnings.push(`ChessArbiter skipped ${link.url}: ${error.message}`);
    }
  }

  return {
    sourceName: SOURCE_NAME,
    sourceUrl,
    tournaments: tournaments.slice(0, Math.max(Number(limit || 25), 1)),
    warnings
  };
};

module.exports = {
  SOURCE_NAME,
  discoverChessArbiterLinks,
  mapChessArbiterCalendarRow,
  mapChessArbiterDetail,
  searchChessArbiterTournaments
};
