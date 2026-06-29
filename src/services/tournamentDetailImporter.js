const fs = require("fs");
const path = require("path");
const Pairing = require("../models/Pairing");
const Player = require("../models/Player");
const Round = require("../models/Round");
const Section = require("../models/Section");
const Event = require("../models/Event");
const EventDocument = require("../models/EventDocument");
const { fetchBuffer } = require("../scrapers/httpClient");
const { detailStatusForStats } = require("./detailImportPlanner");

const documentTypesByExtension = {
  pdf: "pdf",
  xls: "excel",
  xlsx: "excel",
  csv: "excel",
  ods: "excel",
  doc: "word",
  docx: "word",
  rtf: "word",
  pgn: "pgn",
  zip: "archive",
  jpg: "image",
  jpeg: "image",
  png: "image",
  webp: "image"
};

const normalizeNameKey = (value) =>
  String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const splitPlayerName = (value) => {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  if (!clean) return { firstName: "Unknown", lastName: "Player" };

  if (clean.includes(",")) {
    const [lastName, ...rest] = clean.split(",").map((part) => part.trim()).filter(Boolean);
    return {
      firstName: rest.join(" ") || lastName || "Unknown",
      lastName: lastName || "Player"
    };
  }

  const parts = clean.split(" ").filter(Boolean);
  if (parts.length === 1) return { firstName: parts[0], lastName: "Player" };
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1]
  };
};

const normalizeResult = (value, { hasBlack = true } = {}) => {
  const clean = String(value || "").replace(/\s+/g, "").replace("½", "1/2");
  const normalized = clean.replace(/\u00bd/g, "1/2").replace(/Â½/g, "1/2");
  if (/^1F-0F$/i.test(normalized)) return "forfeit-black";
  if (/^0F-1F$/i.test(normalized)) return "forfeit-white";
  if (!hasBlack && /^(1\/2|0\.5)$/.test(normalized)) return "half-bye";
  if (!hasBlack && /^(0|0-1|-)$/.test(normalized)) return "zero-bye";
  if (!hasBlack && /^(1|1-0|\+|bye)$/i.test(normalized)) return "bye-white";
  if (["1-0", "0-1", "1/2-1/2"].includes(normalized)) return normalized;
  if (normalized === "0.5-0.5") return "1/2-1/2";
  if (normalized === "1/2") return hasBlack ? "1/2-1/2" : "half-bye";
  if (normalized === "1") return "1-0";
  if (normalized === "0") return "0-1";
  return "pending";
};

const sourceMeta = (sourceName, originalId, checkedAt) => ({
  name: sourceName || "",
  originalId: originalId || "",
  imported: true,
  lastCheckedAt: checkedAt ? new Date(checkedAt) : new Date()
});

const hasValue = (value) => value !== undefined && value !== null && value !== "";

const eventMetadataUpdate = (event, detail, checkedAt) => {
  const metadata = detail.eventMetadata || {};
  const update = {
    "source.lastCheckedAt": new Date(checkedAt)
  };

  for (const key of [
    "contactEmail",
    "contactPhone",
    "sourceOrganizerName",
    "venueName",
    "address",
    "websiteUrl",
    "resultsUrl",
    "regulationsUrl",
    "timeControl"
  ]) {
    if (hasValue(metadata[key])) update[key] = metadata[key];
  }

  if (Number(metadata.maxPlayers || 0) > 0) update.maxPlayers = Number(metadata.maxPlayers);

  if (hasValue(metadata.description) && !String(event.description || "").includes(metadata.description)) {
    update.description = [event.description, metadata.description].filter(Boolean).join(" - ");
  }

  return update;
};

const extensionFromUrl = (url) => {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return pathname.match(/\.([a-z0-9]+)$/)?.[1] || "";
  } catch {
    return "";
  }
};

const documentTypeFor = (url, explicitType = "") => {
  const extensionType = documentTypesByExtension[extensionFromUrl(url)] || "";
  if (extensionType && ["", "document", "source", "website", "results", "regulations"].includes(explicitType)) {
    return extensionType;
  }
  if (explicitType && explicitType !== "document") return explicitType;
  return extensionType || explicitType || "other";
};

const sanitizeFilename = (value) =>
  String(value || "document")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "document";

const filenameForDocument = (document) => {
  const urlExtension = extensionFromUrl(document.url);
  const baseFromUrl = (() => {
    try {
      return path.basename(new URL(document.url).pathname);
    } catch {
      return "";
    }
  })();
  const base = sanitizeFilename(baseFromUrl || document.label || document.type || "document");
  if (path.extname(base) || !urlExtension) return base;
  return `${base}.${urlExtension}`;
};

const downloadDocument = async (event, document, options = {}) => {
  const maxBytes = Number(options.maxBytes || 15 * 1024 * 1024);
  const uploadRoot = path.join(__dirname, "..", "..", "uploads", "events", String(event._id));
  fs.mkdirSync(uploadRoot, { recursive: true });

  const response = await fetchBuffer(document.url, {
    maxBytes,
    rateLimitMs: Number(options.rateLimitMs || 500),
    respectRobots: Boolean(options.respectRobots),
    timeoutMs: Number(options.timeoutMs || 30000),
    userAgent: process.env.SCRAPER_USER_AGENT || undefined
  });
  const filename = sanitizeFilename(`${Date.now()}-${filenameForDocument(document)}`);
  const filePath = path.join(uploadRoot, filename);
  fs.writeFileSync(filePath, response.body);

  return {
    localPath: filePath,
    localUrl: `/uploads/events/${event._id}/${filename}`,
    mimeType: response.headers["content-type"] || "",
    sizeBytes: response.body.length,
    url: response.url || document.url
  };
};

const clearImportedTournamentData = async (eventId, sourceName) => {
  const filter = {
    event: eventId,
    "source.name": sourceName,
    "source.imported": true
  };
  const uploadRoot = path.resolve(__dirname, "..", "..", "uploads");
  const importedDocuments = await EventDocument.find(filter).select("localPath").lean();

  for (const document of importedDocuments) {
    const localPath = document.localPath ? path.resolve(document.localPath) : "";
    const insideUploadRoot = localPath === uploadRoot || localPath.startsWith(`${uploadRoot}${path.sep}`);
    if (!localPath || !insideUploadRoot || !fs.existsSync(localPath)) continue;
    fs.unlinkSync(localPath);
  }

  const [pairings, rounds, players, sections, documents] = await Promise.all([
    Pairing.deleteMany(filter),
    Round.deleteMany(filter),
    Player.deleteMany(filter),
    Section.deleteMany(filter),
    EventDocument.deleteMany(filter)
  ]);

  return {
    pairings: pairings.deletedCount || 0,
    rounds: rounds.deletedCount || 0,
    players: players.deletedCount || 0,
    sections: sections.deletedCount || 0,
    documents: documents.deletedCount || 0
  };
};

const createImportedDocument = async (event, document, sourceName, checkedAt, options = {}) => {
  if (!document?.url) return { action: "skipped" };
  const type = documentTypeFor(document.url, document.type);
  const payload = {
    event: event._id,
    label: document.label || type || "Document",
    type,
    url: document.url,
    localUrl: "",
    localPath: "",
    mimeType: document.mimeType || "",
    sizeBytes: 0,
    status: "linked",
    error: "",
    source: sourceMeta(sourceName, document.originalId || document.url, checkedAt)
  };

  if (options.downloadDocuments && ["pdf", "excel", "word", "pgn", "archive"].includes(type)) {
    try {
      const downloaded = await downloadDocument(event, payload, options);
      Object.assign(payload, downloaded, {
        status: "downloaded"
      });
    } catch (error) {
      payload.status = "failed";
      payload.error = error.message;
    }
  }

  await EventDocument.create(payload);
  return { action: payload.status, type };
};

const ensurePlayer = async ({ event, section, player, sourceName, checkedAt, cache }) => {
  const name = player.name || [player.lastName, player.firstName].filter(Boolean).join(", ");
  const key = player.externalId || normalizeNameKey(name);
  if (cache.has(key)) return cache.get(key);

  const splitName = splitPlayerName(name);
  const created = await Player.create({
    event: event._id,
    section: section._id,
    firstName: player.firstName || splitName.firstName,
    lastName: player.lastName || splitName.lastName,
    federation: player.federation || player.country || "",
    club: player.club || player.team || "",
    rating: Number(player.rating || 0),
    fideId: player.fideId || "",
    title: player.title || "",
    gender: player.gender || "",
    nationalId: player.nationalId || "",
    nationalRating: Number(player.nationalRating || 0),
    fideK: Number(player.fideK || 0),
    nationalK: Number(player.nationalK || 0),
    performanceRating: Number(player.performanceRating || 0),
    ratingChange: hasValue(player.ratingChange) ? Number(player.ratingChange) : null,
    sourceRank: Number(player.rank || 0),
    sourcePoints: Number(player.points || 0),
    sourceRankedId: Number(player.rankedId || 0),
    sourceTieBreaks: Array.isArray(player.tieBreaks) ? player.tieBreaks : [],
    sourceMatches: Array.isArray(player.matches) ? player.matches : [],
    birthYear: player.birthYear || null,
    status: player.status || "active",
    source: sourceMeta(sourceName, player.externalId || key, checkedAt)
  });
  cache.set(key, created);
  cache.set(normalizeNameKey(name), created);
  return created;
};

const importTournamentDetail = async (event, detail, options = {}) => {
  const sourceName = detail.sourceName || event.source?.name || "";
  const checkedAt = detail.checkedAt || new Date().toISOString();
  const stats = {
    cleared: await clearImportedTournamentData(event._id, sourceName),
    sections: 0,
    players: 0,
    rounds: 0,
    pairings: 0,
    documents: 0,
    downloadedDocuments: 0,
    failedDocuments: 0
  };

  await Event.updateOne(
    { _id: event._id },
    {
      $set: eventMetadataUpdate(event, detail, checkedAt)
    }
  );

  const sections = detail.sections?.length
    ? detail.sections
    : detail.players?.length || detail.rounds?.length
      ? [{ name: detail.sectionName || "Open", roundsCount: detail.rounds?.length || 0 }]
      : [];

  for (const sectionDetail of sections) {
    const section = await Section.create({
      event: event._id,
      name: sectionDetail.name || "Open",
      description: sectionDetail.description || "",
      maxPlayers: Number(sectionDetail.maxPlayers || event.maxPlayers || 0),
      timeControl: sectionDetail.timeControl || event.timeControl || "",
      roundsCount: Number(sectionDetail.roundsCount || detail.rounds?.length || 0),
      pairingSystem: sectionDetail.pairingSystem || "",
      scoringSystem: sectionDetail.scoringSystem || "",
      ratingRule: sectionDetail.ratingRule || "",
      resultsSource: sectionDetail.resultsSource || "",
      sourceTieBreaks: Array.isArray(sectionDetail.tieBreaks) ? sectionDetail.tieBreaks : [],
      tieBreakRating: Number(sectionDetail.tieBreakRating || 0),
      source: sourceMeta(sourceName, sectionDetail.externalId || sectionDetail.name || "open", checkedAt)
    });
    stats.sections += 1;

    const playerCache = new Map();
    const playerDetails = [
      ...(detail.players || []),
      ...((sectionDetail.players || []).map((player) => ({ ...player, sectionName: sectionDetail.name })))
    ];
    for (const player of playerDetails) {
      await ensurePlayer({ event, section, player, sourceName, checkedAt, cache: playerCache });
    }
    stats.players += playerCache.size;

    const roundDetails = detail.rounds?.length ? detail.rounds : sectionDetail.rounds || [];
    for (const roundDetail of roundDetails) {
      const round = await Round.create({
        event: event._id,
        section: section._id,
        number: Number(roundDetail.number || stats.rounds + 1),
        name: roundDetail.name || `Round ${roundDetail.number || stats.rounds + 1}`,
        status:
          roundDetail.status ||
          ((roundDetail.pairings || []).some((pairing) => normalizeResult(pairing.result) !== "pending")
            ? "completed"
            : "published"),
        startsAt: roundDetail.startsAt ? new Date(roundDetail.startsAt) : null,
        source: sourceMeta(sourceName, roundDetail.externalId || roundDetail.number || roundDetail.name, checkedAt)
      });
      stats.rounds += 1;

      for (const [index, pairing] of (roundDetail.pairings || []).entries()) {
        const white = await ensurePlayer({
          event,
          section,
          player: pairing.white,
          sourceName,
          checkedAt,
          cache: playerCache
        });
        const black = pairing.black?.name
          ? await ensurePlayer({
              event,
              section,
              player: pairing.black,
              sourceName,
              checkedAt,
              cache: playerCache
            })
          : null;
        await Pairing.create({
          event: event._id,
          section: section._id,
          round: round._id,
          boardNumber: Number(pairing.boardNumber || index + 1),
          whitePlayer: white._id,
          blackPlayer: black?._id || null,
          result: normalizeResult(pairing.result, { hasBlack: Boolean(black) }),
          sourceWhitePoints: hasValue(pairing.sourceWhitePoints) ? Number(pairing.sourceWhitePoints) : null,
          sourceBlackPoints: hasValue(pairing.sourceBlackPoints) ? Number(pairing.sourceBlackPoints) : null,
          notes: pairing.notes || "",
          source: sourceMeta(sourceName, pairing.externalId || `${roundDetail.number || stats.rounds}-${index + 1}`, checkedAt)
        });
        stats.pairings += 1;
      }
    }

    stats.players = await Player.countDocuments({
      event: event._id,
      "source.name": sourceName,
      "source.imported": true
    });
  }

  for (const document of detail.documents || []) {
    const result = await createImportedDocument(event, document, sourceName, checkedAt, options);
    if (result.action === "skipped") continue;
    stats.documents += 1;
    if (result.action === "downloaded") stats.downloadedDocuments += 1;
    if (result.action === "failed") stats.failedDocuments += 1;
  }

  const detailStats = {
    sections: stats.sections,
    players: stats.players,
    rounds: stats.rounds,
    pairings: stats.pairings,
    documents: stats.documents
  };

  await Event.updateOne(
    { _id: event._id },
    {
      $set: {
        "source.detailLastCheckedAt": new Date(checkedAt),
        "source.detailStatus": detailStatusForStats(stats),
        "source.detailError": "",
        "source.detailStats": detailStats
      }
    }
  );

  return stats;
};

module.exports = {
  documentTypeFor,
  importTournamentDetail,
  normalizeNameKey,
  normalizeResult,
  splitPlayerName
};
