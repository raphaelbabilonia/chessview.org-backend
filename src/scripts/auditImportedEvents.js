require("dotenv").config();
const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");
const mongoose = require("mongoose");
const { connectDB } = require("../config/db");
const Event = require("../models/Event");
const Section = require("../models/Section");
const Player = require("../models/Player");
const Round = require("../models/Round");
const Pairing = require("../models/Pairing");
const Registration = require("../models/Registration");
const EventDocument = require("../models/EventDocument");

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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const todayIsoDate = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString().slice(0, 10);
};

const toIsoDate = (value) => (value ? new Date(value).toISOString().slice(0, 10) : "");

const requiredFields = [
  ["title", "Title"],
  ["slug", "Slug"],
  ["city", "City"],
  ["country", "Country"],
  ["startDate", "Start date"],
  ["endDate", "End date"],
  ["source.name", "Source name"],
  ["source.originalId", "Source original ID"]
];

const getValue = (item, key) =>
  key.split(".").reduce((value, part) => (value && value[part] !== undefined ? value[part] : undefined), item);

const missingRequiredFields = (event) =>
  requiredFields
    .filter(([key]) => {
      const value = getValue(event, key);
      return value === undefined || value === null || value === "";
    })
    .map(([, label]) => label);

const documentKindsByExtension = {
  pdf: "pdf",
  xls: "excel",
  xlsx: "excel",
  csv: "excel",
  ods: "excel",
  doc: "word",
  docx: "word",
  rtf: "word",
  pgn: "pgn",
  zip: "archive"
};

const documentKindsByType = {
  pdf: "pdf",
  excel: "excel",
  word: "word",
  pgn: "pgn",
  archive: "archive",
  image: "image"
};

const normalizeUrl = (value) => String(value || "").trim();

const safeUrl = (value) => {
  try {
    return new URL(value);
  } catch {
    return null;
  }
};

const documentKindFor = (url, contentType = "", type = "") => {
  if (documentKindsByType[type]) return documentKindsByType[type];
  const parsed = safeUrl(url);
  const pathname = parsed?.pathname || "";
  const extension = pathname.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || "";
  if (documentKindsByExtension[extension]) return documentKindsByExtension[extension];

  const contentTypeValue = contentType.toLowerCase();
  if (contentTypeValue.includes("pdf")) return "pdf";
  if (contentTypeValue.includes("spreadsheet") || contentTypeValue.includes("excel") || contentTypeValue.includes("csv")) return "excel";
  if (contentTypeValue.includes("word") || contentTypeValue.includes("officedocument.wordprocessingml")) return "word";
  return "";
};

const collectLinks = (event, importedDocuments = []) => {
  const links = [];
  const seen = new Set();
  const add = ({ field, label, type, url }) => {
    const normalized = normalizeUrl(url);
    if (!normalized) return;
    const key = normalized;
    if (seen.has(key)) return;
    seen.add(key);
    links.push({
      field,
      label: label || field,
      type: type || "",
      url: normalized,
      documentKind: documentKindFor(normalized, "", type || "")
    });
  };

  add({ field: "websiteUrl", label: "Official website", type: "website", url: event.websiteUrl });
  add({ field: "resultsUrl", label: "Results", type: "results", url: event.resultsUrl });
  add({ field: "regulationsUrl", label: "Regulations", type: "regulations", url: event.regulationsUrl });

  for (const link of event.externalLinks || []) {
    add({
      field: "externalLinks",
      label: link.label || link.type || "External link",
      type: link.type || "",
      url: link.url
    });
  }

  for (const document of importedDocuments) {
    add({
      field: "eventDocuments",
      label: document.label || document.type || "Imported document",
      type: document.type || "",
      url: document.url
    });
  }

  return links;
};

const looksLikeReport = (link) => {
  const text = `${link.label} ${link.type} ${link.url}`.toLowerCase();
  return /(report|informe|memoria|standing|standings|ranking|result|results|classifica|risultati)/i.test(text);
};

const requestOnce = (targetUrl, { method, timeoutMs, redirectsLeft }) =>
  new Promise((resolve) => {
    const parsed = safeUrl(targetUrl);
    if (!parsed || !["http:", "https:"].includes(parsed.protocol)) {
      resolve({ ok: false, status: 0, error: "Invalid URL", finalUrl: targetUrl, contentType: "" });
      return;
    }

    const client = parsed.protocol === "https:" ? https : http;
    const headers = {
      Accept: "*/*",
      "User-Agent": "ChessViewBot/0.1 (+https://chessview.org; tournament metadata audit)"
    };
    if (method === "GET") {
      headers.Range = "bytes=0-0";
    }

    const request = client.request(
      parsed,
      {
        method,
        timeout: timeoutMs,
        headers
      },
      (response) => {
        const status = response.statusCode || 0;
        const location = response.headers.location;
        const contentType = response.headers["content-type"] || "";

        if (status >= 300 && status < 400 && location && redirectsLeft > 0) {
          response.resume();
          const nextUrl = new URL(location, parsed).toString();
          resolve(requestOnce(nextUrl, { method, timeoutMs, redirectsLeft: redirectsLeft - 1 }));
          return;
        }

        if (method === "HEAD" && [403, 405].includes(status)) {
          response.resume();
          resolve(requestOnce(targetUrl, { method: "GET", timeoutMs, redirectsLeft }));
          return;
        }

        response.resume();
        resolve({
          ok: status >= 200 && status < 400,
          status,
          error: "",
          finalUrl: targetUrl,
          contentType
        });
      }
    );

    request.on("timeout", () => {
      request.destroy(new Error(`Timeout after ${timeoutMs}ms`));
    });

    request.on("error", (error) => {
      resolve({
        ok: false,
        status: 0,
        error: error.message,
        finalUrl: targetUrl,
        contentType: ""
      });
    });

    request.end();
  });

const checkLink = async (link, timeoutMs, retryDelayMs = 0) => {
  let result = await requestOnce(link.url, {
    method: "HEAD",
    timeoutMs,
    redirectsLeft: 5
  });

  if (!result.ok && result.status === 0) {
    result = await requestOnce(link.url, {
      method: "GET",
      timeoutMs,
      redirectsLeft: 5
    });
  }

  if (!result.ok && result.status === 429 && retryDelayMs > 0) {
    await sleep(retryDelayMs);
    result = await requestOnce(link.url, {
      method: "GET",
      timeoutMs,
      redirectsLeft: 5
    });
  }

  return {
    ...link,
    ...result,
    documentKind: link.documentKind || documentKindFor(result.finalUrl || link.url, result.contentType, link.type)
  };
};

const runQueue = async (items, concurrency, worker, delayMs = 0) => {
  const results = new Array(items.length);
  let nextIndex = 0;

  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      if (delayMs > 0) await sleep(delayMs);
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(workers);
  return results;
};

const countByEvent = async (Model, eventIds, extraMatch = {}) => {
  const rows = await Model.aggregate([
    { $match: { ...extraMatch, event: { $in: eventIds } } },
    { $group: { _id: "$event", count: { $sum: 1 } } }
  ]);
  return new Map(rows.map((row) => [String(row._id), row.count]));
};

const buildCounts = async (eventIds) => {
  const [sections, players, rounds, pairings, completedPairings, registrations] = await Promise.all([
    countByEvent(Section, eventIds),
    countByEvent(Player, eventIds),
    countByEvent(Round, eventIds),
    countByEvent(Pairing, eventIds),
    countByEvent(Pairing, eventIds, { result: { $ne: "pending" } }),
    countByEvent(Registration, eventIds)
  ]);

  return { sections, players, rounds, pairings, completedPairings, registrations };
};

const groupDocumentsByEvent = async (eventIds) => {
  const documents = await EventDocument.find({ event: { $in: eventIds } }).lean();
  return documents.reduce((map, document) => {
    const key = String(document.event);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(document);
    return map;
  }, new Map());
};

const documentTotals = (links) =>
  links.reduce(
    (totals, link) => {
      const kind = link.documentKind || "other";
      totals[kind] = (totals[kind] || 0) + 1;
      return totals;
    },
    { pdf: 0, excel: 0, word: 0, pgn: 0, archive: 0, other: 0 }
  );

const importedDocumentStats = (documents = []) => {
  const byType = documents.reduce(
    (totals, document) => {
      const kind = documentKindsByType[document.type] || "other";
      totals[kind] = (totals[kind] || 0) + 1;
      return totals;
    },
    { pdf: 0, excel: 0, word: 0, pgn: 0, archive: 0, image: 0, other: 0 }
  );

  return {
    total: documents.length,
    linked: documents.filter((document) => document.status === "linked").length,
    downloaded: documents.filter((document) => document.status === "downloaded").length,
    failed: documents.filter((document) => document.status === "failed").length,
    localFiles: documents.filter((document) => document.localUrl).length,
    byType
  };
};

const importedDocumentDetails = (documents = []) =>
  documents.map((document) => ({
    label: document.label,
    type: document.type,
    status: document.status,
    url: document.url,
    localUrl: document.localUrl,
    mimeType: document.mimeType,
    sizeBytes: document.sizeBytes,
    error: document.error
  }));

const csvValue = (value) => {
  const text = value === undefined || value === null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const writeCsv = (filePath, rows) => {
  const columns = [
    "id",
    "title",
    "source",
    "startDate",
    "endDate",
    "city",
    "country",
    "metadataStatus",
    "missingRequired",
    "summaryLoaded",
    "dataQualityScore",
    "localTournamentDataStatus",
    "sections",
    "players",
    "rounds",
    "pairings",
    "completedPairings",
    "registrations",
    "importedDocuments",
    "downloadedDocuments",
    "failedDocuments",
    "localFiles",
    "standingsDerivedAvailable",
    "links",
    "linksOk",
    "linksFailing",
    "pdf",
    "excel",
    "word",
    "pgn",
    "archive",
    "otherDocuments",
    "hasResultsLink",
    "hasRegulationsLink",
    "hasWebsiteLink",
    "hasReportLink",
    "fullyLoaded",
    "detailUrl"
  ];

  const lines = [
    columns.join(","),
    ...rows.map((row) =>
      columns
        .map((column) => {
          if (column === "missingRequired") return csvValue(row.missingRequired.join("; "));
          if (column === "otherDocuments") return csvValue(row.documents.other || 0);
          if (column === "importedDocuments") return csvValue(row.importedDocuments.total || 0);
          if (column === "downloadedDocuments") return csvValue(row.importedDocuments.downloaded || 0);
          if (column === "failedDocuments") return csvValue(row.importedDocuments.failed || 0);
          if (column === "localFiles") return csvValue(row.importedDocuments.localFiles || 0);
          if (["pdf", "excel", "word", "pgn", "archive"].includes(column)) return csvValue(row.documents[column] || 0);
          return csvValue(row[column]);
        })
        .join(",")
    )
  ];

  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
};

const summarizeBySource = (rows) => {
  const sources = new Map();
  for (const row of rows) {
    const key = row.source || "Unknown";
    if (!sources.has(key)) {
      sources.set(key, {
        source: key,
        events: 0,
        metadataOk: 0,
        fullyLoaded: 0,
        localDataComplete: 0,
        withPdf: 0,
        withExcel: 0,
        withWord: 0,
        importedDocuments: 0,
        downloadedDocuments: 0,
        failedDocuments: 0,
        linksFailing: 0,
        qualityScoreTotal: 0
      });
    }

    const source = sources.get(key);
    source.events += 1;
    source.metadataOk += row.metadataStatus === "ok" ? 1 : 0;
    source.fullyLoaded += row.fullyLoaded ? 1 : 0;
    source.localDataComplete += row.localTournamentDataStatus === "complete" ? 1 : 0;
    source.withPdf += row.documents.pdf > 0 ? 1 : 0;
    source.withExcel += row.documents.excel > 0 ? 1 : 0;
    source.withWord += row.documents.word > 0 ? 1 : 0;
    source.importedDocuments += row.importedDocuments.total;
    source.downloadedDocuments += row.importedDocuments.downloaded;
    source.failedDocuments += row.importedDocuments.failed;
    source.linksFailing += row.linksFailing;
    source.qualityScoreTotal += row.dataQualityScore;
  }

  return [...sources.values()]
    .map((source) => ({
      ...source,
      averageQualityScore: source.events ? Math.round((source.qualityScoreTotal / source.events) * 100) / 100 : 0
    }))
    .sort((a, b) => a.source.localeCompare(b.source));
};

const main = async () => {
  await connectDB();

  const checkLinks = hasFlag("check-links");
  const activeFrom = readArg("active-from", todayIsoDate());
  const limit = Number(readArg("limit", "0")) || 0;
  const linkTimeoutMs = Number(readArg("link-timeout-ms", "6000")) || 6000;
  const linkDelayMs = Number(readArg("link-delay-ms", "0")) || 0;
  const linkRetryDelayMs = Number(readArg("link-retry-delay-ms", "0")) || 0;
  const concurrency = Number(readArg("concurrency", "4")) || 4;
  const outDir = path.resolve(readArg("out-dir", path.join("docs", "audits")));
  const query = {
    isPublic: true,
    "source.name": { $nin: ["", null] }
  };

  const eventsQuery = Event.find(query).sort({ "source.name": 1, startDate: 1, title: 1 }).lean();
  if (limit > 0) eventsQuery.limit(limit);
  const events = await eventsQuery;
  const eventIds = events.map((event) => event._id);
  const [counts, documentsByEvent] = await Promise.all([buildCounts(eventIds), groupDocumentsByEvent(eventIds)]);

  const rows = events.map((event) => {
    const id = String(event._id);
    const eventDocuments = documentsByEvent.get(id) || [];
    const links = collectLinks(event, eventDocuments);
    const documentImports = importedDocumentStats(eventDocuments);
    const documents = documentTotals(links);
    const sections = counts.sections.get(id) || 0;
    const players = counts.players.get(id) || 0;
    const rounds = counts.rounds.get(id) || 0;
    const pairings = counts.pairings.get(id) || 0;
    const completedPairings = counts.completedPairings.get(id) || 0;
    const registrations = counts.registrations.get(id) || 0;
    const missingRequired = missingRequiredFields(event);
    const hasAnyLocalData = sections > 0 || players > 0 || rounds > 0 || pairings > 0 || registrations > 0;
    const localTournamentDataStatus =
      sections > 0 && players > 0 && rounds > 0 && pairings > 0 ? "complete" : hasAnyLocalData ? "partial" : "not-loaded";
    const summaryLoaded = Boolean(String(event.description || "").trim());
    const hasResultsLink = Boolean(normalizeUrl(event.resultsUrl)) || links.some((link) => /result|standing/i.test(link.type));
    const hasRegulationsLink = Boolean(normalizeUrl(event.regulationsUrl));
    const hasWebsiteLink = Boolean(normalizeUrl(event.websiteUrl));
    const hasReportLink = links.some(looksLikeReport);
    const standingsDerivedAvailable = players > 0 && completedPairings > 0;
    const metadataStatus = missingRequired.length ? "needs-review" : "ok";
    const fullyLoaded =
      metadataStatus === "ok" &&
      summaryLoaded &&
      localTournamentDataStatus === "complete" &&
      standingsDerivedAvailable &&
      (hasResultsLink || hasReportLink);

    return {
      id,
      title: event.title,
      slug: event.slug,
      source: event.source?.name || "",
      sourceOriginalId: event.source?.originalId || "",
      sourceUrl: event.source?.url || "",
      startDate: toIsoDate(event.startDate),
      endDate: toIsoDate(event.endDate),
      city: event.city || "",
      country: event.country || "",
      status: event.status || "",
      registrationStatus: event.registrationStatus || "",
      metadataStatus,
      missingRequired,
      summaryLoaded,
      dataQualityScore: event.dataQualityScore || 0,
      localTournamentDataStatus,
      sections,
      players,
      rounds,
      pairings,
      completedPairings,
      registrations,
      importedDocuments: documentImports,
      importedDocumentDetails: importedDocumentDetails(eventDocuments),
      standingsDerivedAvailable,
      links: links.length,
      linksOk: 0,
      linksFailing: 0,
      documents,
      hasResultsLink,
      hasRegulationsLink,
      hasWebsiteLink,
      hasReportLink,
      fullyLoaded,
      detailUrl: `/events/${event.slug}`,
      linksDetail: links,
      notes: [
        localTournamentDataStatus === "not-loaded"
          ? "No local sections, players, rounds, pairings, registrations, or standings are imported yet."
          : "",
        !summaryLoaded ? "Description/summary is empty." : "",
        documents.pdf + documents.excel + documents.word === 0
          ? "No PDF, Excel, or Word document link detected in event metadata."
          : "",
        documentImports.failed ? `${documentImports.failed} imported document download(s) failed.` : ""
      ].filter(Boolean)
    };
  });

  const allLinks = rows.flatMap((row) => row.linksDetail.map((link) => ({ ...link, eventId: row.id })));
  if (checkLinks && allLinks.length) {
    const uniqueLinks = [...new Map(allLinks.map((link) => [link.url, link])).values()];
    const checkedUniqueLinks = await runQueue(
      uniqueLinks,
      concurrency,
      (link) => checkLink(link, linkTimeoutMs, linkRetryDelayMs),
      linkDelayMs
    );
    const checkedByUrl = new Map(checkedUniqueLinks.map((link) => [link.url, link]));
    const checkedLinks = allLinks.map((link) => {
      const result = checkedByUrl.get(link.url) || {};
      return {
        ...link,
        ok: Boolean(result.ok),
        status: result.status || 0,
        error: result.error || "",
        finalUrl: result.finalUrl || link.url,
        contentType: result.contentType || "",
        documentKind: link.documentKind || result.documentKind || ""
      };
    });
    const linksByEvent = checkedLinks.reduce((map, link) => {
      if (!map.has(link.eventId)) map.set(link.eventId, []);
      map.get(link.eventId).push(link);
      return map;
    }, new Map());

    for (const row of rows) {
      const checked = linksByEvent.get(row.id) || [];
      row.linksDetail = checked;
      row.linksOk = checked.filter((link) => link.ok).length;
      row.linksFailing = checked.filter((link) => !link.ok).length;
      row.documents = documentTotals(checked);
      if (row.linksFailing > 0) {
        row.notes.push(`${row.linksFailing} external link(s) failed health check.`);
      }
    }
  }

  const activeDate = new Date(activeFrom);
  const summary = {
    generatedAt: new Date().toISOString(),
    activeFrom,
    checkedLinks: checkLinks,
    totals: {
      events: rows.length,
      activeEvents: rows.filter((row) => new Date(row.endDate) >= activeDate).length,
      metadataOk: rows.filter((row) => row.metadataStatus === "ok").length,
      metadataNeedsReview: rows.filter((row) => row.metadataStatus !== "ok").length,
      fullyLoaded: rows.filter((row) => row.fullyLoaded).length,
      localDataComplete: rows.filter((row) => row.localTournamentDataStatus === "complete").length,
      localDataPartial: rows.filter((row) => row.localTournamentDataStatus === "partial").length,
      localDataMissing: rows.filter((row) => row.localTournamentDataStatus === "not-loaded").length,
      withPdf: rows.filter((row) => row.documents.pdf > 0).length,
      withExcel: rows.filter((row) => row.documents.excel > 0).length,
      withWord: rows.filter((row) => row.documents.word > 0).length,
      importedDocuments: rows.reduce((total, row) => total + row.importedDocuments.total, 0),
      downloadedDocuments: rows.reduce((total, row) => total + row.importedDocuments.downloaded, 0),
      failedDocuments: rows.reduce((total, row) => total + row.importedDocuments.failed, 0),
      links: rows.reduce((total, row) => total + row.links, 0),
      linksOk: rows.reduce((total, row) => total + row.linksOk, 0),
      linksFailing: rows.reduce((total, row) => total + row.linksFailing, 0)
    },
    bySource: summarizeBySource(rows)
  };

  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = path.join(outDir, `imported-events-audit-${stamp}.json`);
  const csvPath = path.join(outDir, `imported-events-audit-${stamp}.csv`);
  fs.writeFileSync(jsonPath, JSON.stringify({ ok: true, summary, events: rows }, null, 2), "utf8");
  writeCsv(csvPath, rows);

  console.log(
    JSON.stringify(
      {
        ok: true,
        summary,
        files: {
          json: jsonPath,
          csv: csvPath
        }
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
