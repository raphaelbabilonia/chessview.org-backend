const cheerio = require("cheerio");
const { fetchText } = require("./httpClient");
const { compactText, inferRatingType, inferTimeControl, parseEnglishDateRange, stripHtml } = require("./tournamentUtils");

const SOURCE_NAME = "AICF";
const DEFAULT_ENDPOINT = "https://aicf.in/all-events/";

const absoluteUrl = (href, base = DEFAULT_ENDPOINT) => new URL(href, base).toString();

const cleanTitle = (value) =>
  stripHtml(value)
    .replace(/\s+/g, " ")
    .replace(/\s+All India Chess Federation$/i, "")
    .trim();

const dateFromParts = (year, month, day) => {
  const resolvedYear = Number(year);
  const resolvedMonth = Number(month);
  const resolvedDay = Number(day);
  if (!resolvedYear || !resolvedMonth || !resolvedDay) return "";
  const date = new Date(Date.UTC(resolvedYear, resolvedMonth - 1, resolvedDay, 12, 0, 0));
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
};

const parseDmyDate = (value) => {
  const match = stripHtml(value).match(/(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (!match) return "";
  return dateFromParts(match[3], match[2], match[1]);
};

const startOfUtcDay = (date) => {
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return new Date(0);
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 0, 0, 0));
};

const parseTableLocation = (value) => {
  const raw = stripHtml(value).replace(/\s+/g, " ").trim();
  if (!raw) return { city: "India", country: "India", venue: "" };
  const parts = raw.split(",").map((part) => part.trim()).filter(Boolean);
  return {
    city: parts[0] || raw,
    country: "India",
    venue: raw
  };
};

const uniqueEventUrl = (sourceUrl, eventCode, title) => {
  const id = String(eventCode || title || "event")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const url = new URL(sourceUrl || DEFAULT_ENDPOINT, DEFAULT_ENDPOINT);
  url.hash = `event-${id || "aicf"}`;
  return url.toString();
};

const mapAicfTableRow = ($, row, { checkedAt = new Date(), sourceUrl = DEFAULT_ENDPOINT } = {}) => {
  const cells = $(row).children("td,th");
  if (cells.length < 5) return null;

  const first = cleanTitle(cells.eq(0).text());
  if (!first || /name of tournament/i.test(first)) return null;

  const eventCode = stripHtml(cells.eq(1).text()).replace(/\s+/g, "");
  const startDate = parseDmyDate(cells.eq(2).text());
  const endDate = parseDmyDate(cells.eq(3).text()) || startDate;
  if (!startDate || !endDate || new Date(endDate) < new Date(startDate)) return null;

  const location = parseTableLocation(cells.eq(4).text());
  const brochureHref = cells.eq(5).find("a[href]").first().attr("href") || "";
  const eventSourceUrl = uniqueEventUrl(sourceUrl, eventCode, first);
  const description = compactText(`${first} ${eventCode ? `Event code ${eventCode}` : ""} ${location.venue}`, 260);

  return {
    title: first,
    description,
    city: location.city,
    country: location.country,
    venue: location.venue || location.city,
    address: location.venue,
    startDate,
    endDate,
    timeControl: inferTimeControl(first),
    ratingType: inferRatingType(first) || (/\bfide\b/i.test(first) ? "FIDE" : "national"),
    sourceName: SOURCE_NAME,
    sourceUrl: eventSourceUrl,
    registrationUrl: eventSourceUrl,
    regulationsUrl: brochureHref ? absoluteUrl(brochureHref, sourceUrl) : "",
    originalId: `aicf:event:${eventCode || eventSourceUrl.split("#").pop()}`,
    lastCheckedAt: checkedAt.toISOString()
  };
};

const discoverAicfTableTournaments = (
  html,
  { endpoint = DEFAULT_ENDPOINT, limit = 25, checkedAt = new Date(), includePast = false } = {}
) => {
  const $ = cheerio.load(html);
  const today = startOfUtcDay(checkedAt);
  const seen = new Set();
  const tournaments = [];

  $("table").each((_, table) => {
    const headerText = cleanTitle($(table).find("tr").first().text());
    if (!/name of tournament/i.test(headerText) || !/event code/i.test(headerText)) return;

    $(table)
      .find("tr")
      .each((__, row) => {
        const tournament = mapAicfTableRow($, row, { checkedAt, sourceUrl: endpoint });
        if (!tournament || seen.has(tournament.originalId)) return;
        if (!includePast && new Date(tournament.endDate) < today) return;
        seen.add(tournament.originalId);
        tournaments.push(tournament);
      });
  });

  return tournaments
    .sort((left, right) => new Date(left.startDate) - new Date(right.startDate))
    .slice(0, Math.max(Number(limit || 25), 1));
};

const discoverAicfLinks = (html, { endpoint = DEFAULT_ENDPOINT, limit = 25 } = {}) => {
  const $ = cheerio.load(html);
  const seen = new Set();
  const links = [];

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href") || "";
    const text = cleanTitle($(element).text());
    const combined = `${href} ${text}`;
    if (!/^https?:\/\/aicf\.in\//i.test(href)) return;
    if (/(ranking|certificate|final report|announcement|seminar|exam|successful arbiters|medical evaluation)/i.test(combined)) return;
    if (!/(championship|tournament|open|national|asian|world|commonwealth|rapid|blitz)/i.test(combined)) return;
    if (!/20\d{2}/.test(combined)) return;
    if (seen.has(href)) return;
    seen.add(href);
    links.push({ title: text, url: href });
  });

  return links.slice(0, Math.max(Number(limit || 25), 1));
};

const parseLocation = (title) => {
  const text = cleanTitle(title);
  const match = text.match(/\bin\s+(.+?)\s+from\b/i) || text.match(/\bat\s+(.+?)\s+from\b/i);
  const raw = (match?.[1] || "").replace(/\s+-\s+/g, ", ").trim();
  if (!raw) return { city: "India", country: "India", venue: "" };
  const parts = raw.split(",").map((part) => part.trim()).filter(Boolean);
  const country = parts.length > 1 ? parts[parts.length - 1] : "India";
  const city = parts[0] || country;
  return { city, country, venue: raw };
};

const mapAicfDetail = (html, { checkedAt = new Date(), fallbackTitle = "", sourceUrl } = {}) => {
  const $ = cheerio.load(html);
  const rawTitle = cleanTitle($("h1").first().text()) || fallbackTitle || cleanTitle($("title").text());
  const text = stripHtml($.root().text());
  const { startDate, endDate } = parseEnglishDateRange(`${rawTitle} ${text}`);
  const location = parseLocation(rawTitle);

  return {
    title: rawTitle,
    description: compactText(text, 260),
    city: location.city,
    country: location.country,
    venue: location.venue || location.city,
    address: location.venue,
    startDate,
    endDate,
    timeControl: inferTimeControl(rawTitle),
    ratingType: inferRatingType(rawTitle) || "FIDE",
    sourceName: SOURCE_NAME,
    sourceUrl,
    registrationUrl: sourceUrl,
    originalId: `aicf:event:${new URL(sourceUrl).pathname.replace(/^\/|\/$/g, "")}`,
    lastCheckedAt: checkedAt.toISOString()
  };
};

const searchAicfCalendar = async ({
  endpoint = DEFAULT_ENDPOINT,
  limit = 25,
  rateLimitMs = 1500,
  respectRobots = true,
  timeoutMs = 20000,
  userAgent
} = {}) => {
  const checkedAt = new Date();
  const html = await fetchText(endpoint, { rateLimitMs, respectRobots, timeoutMs, userAgent });
  const tableTournaments = discoverAicfTableTournaments(html, { endpoint, limit, checkedAt });
  if (tableTournaments.length) {
    return {
      sourceName: SOURCE_NAME,
      sourceUrl: endpoint,
      tournaments: tableTournaments,
      warnings: []
    };
  }

  const links = discoverAicfLinks(html, { endpoint, limit });
  const tournaments = [];
  const warnings = [];

  for (const link of links) {
    try {
      const detailHtml = await fetchText(link.url, { rateLimitMs, respectRobots, timeoutMs, userAgent });
      const tournament = mapAicfDetail(detailHtml, {
        checkedAt,
        fallbackTitle: link.title,
        sourceUrl: link.url
      });
      if (tournament.title && tournament.startDate && tournament.sourceUrl) {
        tournaments.push(tournament);
      } else {
        warnings.push(`AICF skipped ${link.url} because required metadata was missing.`);
      }
    } catch (error) {
      warnings.push(`AICF skipped ${link.url}: ${error.message}`);
    }
  }

  return {
    sourceName: SOURCE_NAME,
    sourceUrl: endpoint,
    tournaments: tournaments.slice(0, Math.max(Number(limit || 25), 1)),
    warnings
  };
};

module.exports = {
  SOURCE_NAME,
  discoverAicfLinks,
  discoverAicfTableTournaments,
  mapAicfTableRow,
  mapAicfDetail,
  parseLocation,
  searchAicfCalendar
};
