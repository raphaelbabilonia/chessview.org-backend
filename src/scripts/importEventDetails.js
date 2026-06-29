require("dotenv").config();
const cheerio = require("cheerio");
const mongoose = require("mongoose");
const { connectDB } = require("../config/db");
const Event = require("../models/Event");
const { fetchText } = require("../scrapers/httpClient");
const { fetchInfo64TournamentDetail } = require("../scrapers/info64");
const { fetchLichessBroadcastDetail } = require("../scrapers/lichessBroadcasts");
const { fetchVesusTournamentDetail } = require("../scrapers/vesus");
const { importTournamentDetail, documentTypeFor } = require("../services/tournamentDetailImporter");
const { buildDetailImportQuery, todayIsoDate } = require("../services/detailImportPlanner");

const readArg = (name, fallback = "") => {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);

  const index = process.argv.indexOf(`--${name}`);
  if (index !== -1 && process.argv[index + 1] && !process.argv[index + 1].startsWith("--")) {
    return process.argv[index + 1];
  }

  return fallback;
};

const hasFlag = (name) => process.argv.includes(`--${name}`);

const absoluteUrl = (href, base) => {
  try {
    return new URL(href, base).toString();
  } catch {
    return "";
  }
};

const normalizeChessArbiterUrl = (sourceUrl) => {
  try {
    const url = new URL(sourceUrl);
    const turn = url.searchParams.get("turn");
    if (turn) return new URL(`/turnieje/${turn.replace(/^\/+|\/+$/g, "")}/`, url.origin).toString();
    return sourceUrl.endsWith("/") ? sourceUrl : `${sourceUrl}/`;
  } catch {
    return sourceUrl;
  }
};

const documentLinksFromEvent = (event) => {
  const docs = [];
  const seen = new Set();
  const add = ({ label, type, url }) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    docs.push({
      label: label || type || "Link",
      type: documentTypeFor(url, type || ""),
      url,
      originalId: `event-link:${url}`
    });
  };

  add({ label: "Original source", type: "source", url: event.source?.url });
  add({ label: "Official website", type: "website", url: event.websiteUrl });
  add({ label: "Results", type: "results", url: event.resultsUrl });
  add({ label: "Regulations", type: "regulations", url: event.regulationsUrl });
  for (const link of event.externalLinks || []) {
    add({ label: link.label, type: link.type, url: link.url });
  }

  return docs;
};

const documentLinksFromHtml = (html, baseUrl, sourceName) => {
  const $ = cheerio.load(html);
  const docs = [];
  const seen = new Set();

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href") || "";
    const url = absoluteUrl(href, baseUrl);
    if (!url || seen.has(url)) return;
    const label = ($(element).text() || href).replace(/\s+/g, " ").trim();
    const type = documentTypeFor(url, "");
    const looksUseful = ["pdf", "excel", "word", "pgn", "archive"].includes(type) || /regulamin|result|standing|lista|download|pdf|xls|doc|pgn/i.test(`${label} ${url}`);
    if (!looksUseful) return;
    seen.add(url);
    docs.push({
      label: label || `${sourceName} document`,
      type,
      url,
      originalId: `${sourceName}:html-link:${url}`
    });
  });

  return docs;
};

const fetchGenericDocumentDetail = async (event, options) => {
  const documents = documentLinksFromEvent(event);

  if (event.source?.name === "ChessArbiter" && event.source?.url) {
    const sourceUrl = normalizeChessArbiterUrl(event.source.url);
    try {
      const html = await fetchText(sourceUrl, options);
      documents.push(...documentLinksFromHtml(html, sourceUrl, "ChessArbiter"));
    } catch (error) {
      documents.push({
        label: "ChessArbiter document scan failed",
        type: "other",
        url: event.source.url,
        originalId: `chessarbiter:scan-failed:${event._id}`
      });
    }
  }

  return {
    sourceName: event.source?.name || "",
    checkedAt: new Date().toISOString(),
    sections: [],
    players: [],
    rounds: [],
    documents,
    sourceUrl: event.source?.url || ""
  };
};

const fetchDetailForEvent = async (event, options) => {
  if (event.source?.name === "Info64" && event.source?.url) {
    return fetchInfo64TournamentDetail({
      sourceUrl: event.source.url,
      exportDocuments: true,
      ...options
    });
  }

  if (event.source?.name === "Lichess Broadcasts" && event.source?.url) {
    return fetchLichessBroadcastDetail({
      sourceUrl: event.source.url,
      ...options
    });
  }

  if (event.source?.name === "Vesus" && event.source?.url) {
    return fetchVesusTournamentDetail({
      sourceUrl: event.source.url,
      ...options
    });
  }

  return fetchGenericDocumentDetail(event, options);
};

const main = async () => {
  await connectDB();

  const source = readArg("source", "");
  const limit = Number(readArg("limit", "0")) || 0;
  const downloadDocuments = hasFlag("download-documents");
  const includePast = hasFlag("include-past");
  const missingDetailOnly = hasFlag("missing-detail-only");
  const activeFrom = readArg("active-from", todayIsoDate());
  const staleHours = Number(readArg("stale-hours", "6"));
  const planOnly = hasFlag("plan-only");
  const query = buildDetailImportQuery({
    activeFrom,
    includePast,
    missingDetailOnly,
    source,
    staleHours
  });

  const eventQuery = Event.find(query).sort({ endDate: 1, startDate: 1, "source.name": 1, title: 1 });
  if (limit > 0) eventQuery.limit(limit);
  const events = await eventQuery;
  if (planOnly) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          action: "plan-detail-import",
          options: {
            activeFrom,
            includePast,
            limit,
            missingDetailOnly,
            source,
            staleHours
          },
          query,
          totals: {
            events: events.length
          },
          events: events.map((event) => ({
            id: String(event._id),
            title: event.title,
            endDate: event.endDate,
            source: event.source?.name || "",
            detailStatus: event.source?.detailStatus || "",
            detailLastCheckedAt: event.source?.detailLastCheckedAt || null
          }))
        },
        null,
        2
      )
    );
    return;
  }
  const totals = {
    events: events.length,
    succeeded: 0,
    failed: 0,
    sections: 0,
    players: 0,
    rounds: 0,
    pairings: 0,
    documents: 0,
    downloadedDocuments: 0,
    failedDocuments: 0
  };
  const results = [];
  const options = {
    downloadDocuments,
    maxBytes: Number(readArg("max-document-bytes", String(15 * 1024 * 1024))),
    rateLimitMs: Number(readArg("rate-limit-ms", "1200")),
    respectRobots: !hasFlag("ignore-robots"),
    timeoutMs: Number(readArg("timeout-ms", "30000")),
    userAgent: process.env.SCRAPER_USER_AGENT || undefined
  };

  for (const event of events) {
    try {
      const detail = await fetchDetailForEvent(event, options);
      const stats = await importTournamentDetail(event, detail, options);
      totals.succeeded += 1;
      for (const key of ["sections", "players", "rounds", "pairings", "documents", "downloadedDocuments", "failedDocuments"]) {
        totals[key] += stats[key] || 0;
      }
      results.push({
        ok: true,
        id: String(event._id),
        title: event.title,
        source: event.source?.name || "",
        stats
      });
    } catch (error) {
      await Event.updateOne(
        { _id: event._id },
        {
          $set: {
            "source.detailLastCheckedAt": new Date(),
            "source.detailStatus": "failed",
            "source.detailError": error.message
          }
        }
      );
      totals.failed += 1;
      results.push({
        ok: false,
        id: String(event._id),
        title: event.title,
        source: event.source?.name || "",
        error: error.message
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: totals.failed === 0,
        options: {
          ...options,
          activeFrom,
          includePast,
          missingDetailOnly,
          source,
          staleHours
        },
        query,
        totals,
        results
      },
      null,
      2
    )
  );
};

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });
