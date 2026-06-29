const ScrapeJob = require("../models/ScrapeJob");
const ScrapeSource = require("../models/ScrapeSource");
const { searchAicfCalendar } = require("../scrapers/aicfCalendar");
const { searchChessArbiterTournaments } = require("../scrapers/chessArbiter");
const { searchChessRegTournaments } = require("../scrapers/chessregApi");
const { searchFideCalendar } = require("../scrapers/fideCalendar");
const { searchFideRatedTournaments } = require("../scrapers/fideRatedTournaments");
const { searchInfo64Tournaments } = require("../scrapers/info64");
const { searchLichessBroadcasts } = require("../scrapers/lichessBroadcasts");
const { searchManualReviewSource } = require("../scrapers/manualReviewSource");
const { searchVesusTournaments } = require("../scrapers/vesus");
const { importTournamentMetadata } = require("./tournamentMetadataImporter");

const DEFAULT_SCRAPE_SOURCES = [
  {
    name: "Vesus - Public",
    key: "vesus-public",
    type: "vesus",
    enabled: true,
    config: {
      accessType: "api-event-stream",
      priority: 1,
      endpoint: "https://vesus.org",
      apiEndpoint: "https://api.vesus.org/graphql",
      timings: ["INPROGRESS", "FUTURE", "ARCHIVED"],
      limit: 20,
      pageSize: 20,
      rateLimitMs: 1200,
      respectRobots: false,
      timeoutMs: 30000
    },
    intervalMinutes: 360
  },
  {
    name: "Lichess Broadcasts - World",
    key: "lichess-broadcasts-world",
    type: "lichess-broadcasts",
    enabled: true,
    config: {
      accessType: "api",
      priority: 6,
      query: "world",
      page: 1,
      limit: 10,
      rateLimitMs: 1000,
      respectRobots: false,
      timeoutMs: 20000
    },
    intervalMinutes: 360
  },
  {
    name: "ChessReg - USA",
    key: "chessreg-api-usa",
    type: "chessreg-api",
    enabled: true,
    config: {
      accessType: "api",
      priority: 2,
      endpoint: "https://chessreg.com/api/v/1/tournaments.json",
      defaultCountry: "United States",
      limit: 10,
      rateLimitMs: 1000,
      respectRobots: false,
      timeoutMs: 20000
    },
    intervalMinutes: 360
  },
  {
    name: "Info64 - Spain and Latin America",
    key: "info64-spain-latam",
    type: "info64",
    enabled: true,
    config: {
      accessType: "scraping-prudent",
      priority: 10,
      endpoint: "https://info64.org",
      limit: 10,
      rateLimitMs: 1500,
      respectRobots: true,
      timeoutMs: 20000
    },
    intervalMinutes: 720
  },
  {
    name: "ChessArbiter - Poland",
    key: "chessarbiter-poland",
    type: "chessarbiter",
    enabled: true,
    config: {
      accessType: "scraping-prudent",
      priority: 11,
      endpoint: "https://www.chessarbiter.com/turnieje.php",
      limit: 10,
      rateLimitMs: 1500,
      respectRobots: true,
      timeoutMs: 20000
    },
    intervalMinutes: 720
  },
  {
    name: "AICF - India",
    key: "aicf-india",
    type: "aicf-calendar",
    enabled: true,
    config: {
      accessType: "scraping-prudent",
      priority: 12,
      endpoint: "https://aicf.in/all-events/",
      limit: 10,
      rateLimitMs: 1500,
      respectRobots: true,
      timeoutMs: 20000
    },
    intervalMinutes: 720
  },
  {
    name: "FIDE Calendar - Italy",
    key: "fide-calendar-italy",
    type: "fide-calendar",
    enabled: false,
    config: {
      accessType: "scraping-prudent",
      priority: 4,
      country: "it",
      countryName: "Italy",
      limit: 10,
      monthsAhead: 12,
      allowDateWindowFallback: false,
      rateLimitMs: 1500,
      respectRobots: true,
      timeoutMs: 20000
    },
    intervalMinutes: 720
  },
  {
    name: "FIDE Rated Tournaments - Italy",
    key: "fide-rated-italy",
    type: "fide-rated-tournaments",
    enabled: false,
    config: {
      accessType: "scraping-prudent",
      priority: 5,
      country: "ITA",
      countryName: "Italy",
      period: "current",
      limit: 10,
      rateLimitMs: 1500,
      respectRobots: true,
      timeoutMs: 20000
    },
    intervalMinutes: 720
  },
  {
    name: "Chess-Results - Global",
    key: "chess-results-global",
    type: "manual-review",
    enabled: false,
    config: {
      accessType: "partnership-recommended",
      priority: 1,
      sourceUrl: "https://chess-results.com",
      reason: "Chess-Results is high value but should use a partnership or very conservative source-specific adapter before enabling."
    },
    intervalMinutes: 1440
  },
  {
    name: "Federscacchi - Italy",
    key: "federscacchi-italy",
    type: "manual-review",
    enabled: false,
    config: {
      accessType: "scraping-prudent",
      priority: 3,
      sourceUrl: "https://www.federscacchi.com/fsi/index.php/calendario/calendario",
      reason: "Official FSI pages are available, but no stable structured event feed was confirmed yet."
    },
    intervalMinutes: 1440
  },
  {
    name: "Vesus - Italy",
    key: "vesus-italy",
    type: "manual-review",
    enabled: false,
    config: {
      accessType: "partnership-recommended",
      priority: 1,
      sourceUrl: "https://vesus.org",
      reason: "Vesus is a modern SPA and should be integrated through partnership/API access before importing data."
    },
    intervalMinutes: 1440
  },
  {
    name: "US Chess - Upcoming Tournaments",
    key: "uschess-upcoming",
    type: "manual-review",
    enabled: false,
    config: {
      accessType: "blocked-by-cloudflare",
      priority: 7,
      sourceUrl: "https://new.uschess.org/upcoming-tournaments",
      reason: "US Chess upcoming tournaments currently returns a Cloudflare challenge to server-side requests; use partnership/API access or a permitted feed."
    },
    intervalMinutes: 1440
  },
  {
    name: "Chess.com Events",
    key: "chesscom-events",
    type: "manual-review",
    enabled: false,
    config: {
      accessType: "api-or-embedded-data-needed",
      priority: 8,
      sourceUrl: "https://www.chess.com/events",
      reason: "Chess.com events page renders public HTML but did not expose importable event metadata in the initial server response."
    },
    intervalMinutes: 1440
  },
  {
    name: "Tornelo",
    key: "tornelo-global",
    type: "manual-review",
    enabled: false,
    config: {
      accessType: "partnership-recommended",
      priority: 9,
      sourceUrl: "https://tornelo.com",
      reason: "Tornelo is a modern SPA; use partnership/API access before importing tournament data."
    },
    intervalMinutes: 1440
  },
  {
    name: "Deutscher Schachbund",
    key: "schachbund-germany",
    type: "manual-review",
    enabled: false,
    config: {
      accessType: "scraping-research",
      priority: 13,
      sourceUrl: "https://www.schachbund.de",
      reason: "Official German site responds, but a dedicated calendar adapter is needed before import."
    },
    intervalMinutes: 1440
  },
  {
    name: "FFE - France",
    key: "ffe-france",
    type: "manual-review",
    enabled: false,
    config: {
      accessType: "scraping-research",
      priority: 14,
      sourceUrl: "https://www.echecs.asso.fr",
      reason: "Official French federation site responds, but a source-specific homologated tournament adapter is needed."
    },
    intervalMinutes: 1440
  },
  {
    name: "ECF - England",
    key: "ecf-england",
    type: "manual-review",
    enabled: false,
    config: {
      accessType: "blocked-by-cloudflare",
      priority: 15,
      sourceUrl: "https://www.englishchess.org.uk",
      reason: "English Chess Federation site blocked server-side requests during probing; use an official feed or permission."
    },
    intervalMinutes: 1440
  },
  {
    name: "KNSB - Netherlands",
    key: "knsb-netherlands",
    type: "manual-review",
    enabled: false,
    config: {
      accessType: "scraping-research",
      priority: 16,
      sourceUrl: "https://schaakbond.nl",
      reason: "KNSB site responds, but tournament data needs a dedicated adapter for its event/search flow."
    },
    intervalMinutes: 1440
  },
  {
    name: "Schaakkalender - Netherlands",
    key: "schaakkalender-netherlands",
    type: "manual-review",
    enabled: false,
    config: {
      accessType: "scraping-research",
      priority: 17,
      sourceUrl: "https://www.schaakkalender.nl",
      reason: "The base endpoint returned JSON not found during probing; find the supported calendar endpoint before import."
    },
    intervalMinutes: 1440
  },
  {
    name: "Canadian Chess Federation",
    key: "canadian-chess-federation",
    type: "manual-review",
    enabled: false,
    config: {
      accessType: "scraping-research",
      priority: 18,
      sourceUrl: "https://www.chess.ca/en/events/",
      reason: "Canadian Chess Federation events page responds; a source-specific adapter should be added after detail page mapping."
    },
    intervalMinutes: 1440
  }
];

const DEFAULT_LICHESS_SOURCE = DEFAULT_SCRAPE_SOURCES[0];

const assertPersistentStore = () => {};

const addMinutes = (date, minutes) => new Date(date.getTime() + Math.max(Number(minutes || 0), 1) * 60000);

const normalizeMode = (mode) => (mode === "apply" ? "apply" : "dry-run");

const normalizeJobLimit = (value, { fallback = 5, min = 1, max = 20 } = {}) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
};

const workerName = () => `${process.env.COMPUTERNAME || process.env.HOSTNAME || "worker"}:${process.pid}`;

const compactJob = (job) => ({
  id: String(job._id),
  source: job.source ? String(job.source) : null,
  sourceName: job.sourceName,
  sourceType: job.sourceType,
  mode: job.mode,
  status: job.status,
  startedAt: job.startedAt,
  finishedAt: job.finishedAt,
  stats: job.stats,
  sourceUrl: job.sourceUrl,
  results: job.results,
  warnings: job.warnings,
  error: job.error
});

const ensureDefaultScrapeSources = async () => {
  assertPersistentStore();

  const sources = [];

  for (const defaultSource of DEFAULT_SCRAPE_SOURCES) {
    sources.push(
      await ScrapeSource.findOneAndUpdate(
        { key: defaultSource.key },
        {
          $setOnInsert: defaultSource
        },
        {
          new: true,
          upsert: true
        }
      )
    );
  }

  return sources;
};

const runAdapter = async (source, overrideConfig = {}) => {
  const config = {
    ...(source.config || {}),
    ...overrideConfig
  };

  if (source.type === "lichess-broadcasts") {
    const result = await searchLichessBroadcasts({
      query: config.query || "world",
      page: Number(config.page || 1),
      rateLimitMs: Number(config.rateLimitMs || 1000),
      respectRobots: Boolean(config.respectRobots),
      timeoutMs: Number(config.timeoutMs || 20000),
      userAgent: process.env.SCRAPER_USER_AGENT || undefined
    });
    const limit = Number(config.limit || result.tournaments.length);
    return {
      ...result,
      config,
      tournaments: result.tournaments.slice(0, Number.isFinite(limit) ? limit : result.tournaments.length)
    };
  }

  if (source.type === "chessreg-api") {
    const result = await searchChessRegTournaments({
      defaultCity: config.defaultCity,
      defaultCountry: config.defaultCountry || "United States",
      endpoint: config.endpoint,
      limit: Number(config.limit || 25),
      rateLimitMs: Number(config.rateLimitMs || 1000),
      respectRobots: Boolean(config.respectRobots),
      timeoutMs: Number(config.timeoutMs || 20000),
      userAgent: process.env.SCRAPER_USER_AGENT || undefined
    });
    return { ...result, config };
  }

  if (source.type === "info64") {
    const result = await searchInfo64Tournaments({
      endpoint: config.endpoint,
      limit: Number(config.limit || 25),
      rateLimitMs: Number(config.rateLimitMs || 1500),
      respectRobots: config.respectRobots !== false,
      timeoutMs: Number(config.timeoutMs || 20000),
      userAgent: process.env.SCRAPER_USER_AGENT || undefined
    });
    return { ...result, config };
  }

  if (source.type === "chessarbiter") {
    const result = await searchChessArbiterTournaments({
      endpoint: config.endpoint,
      limit: Number(config.limit || 25),
      rateLimitMs: Number(config.rateLimitMs || 1500),
      respectRobots: config.respectRobots !== false,
      timeoutMs: Number(config.timeoutMs || 20000),
      userAgent: process.env.SCRAPER_USER_AGENT || undefined
    });
    return { ...result, config };
  }

  if (source.type === "aicf-calendar") {
    const result = await searchAicfCalendar({
      endpoint: config.endpoint,
      limit: Number(config.limit || 25),
      rateLimitMs: Number(config.rateLimitMs || 1500),
      respectRobots: config.respectRobots !== false,
      timeoutMs: Number(config.timeoutMs || 20000),
      userAgent: process.env.SCRAPER_USER_AGENT || undefined
    });
    return { ...result, config };
  }

  if (source.type === "vesus") {
    const result = await searchVesusTournaments({
      apiEndpoint: config.apiEndpoint,
      baseUrl: config.endpoint || config.sourceUrl,
      language: config.language || "en",
      limit: Number(config.limit || 25),
      pageSize: Number(config.pageSize || 20),
      rateLimitMs: Number(config.rateLimitMs || 1200),
      timings: config.timings,
      timeoutMs: Number(config.timeoutMs || 30000),
      userAgent: process.env.SCRAPER_USER_AGENT || undefined
    });
    return { ...result, config };
  }

  if (source.type === "fide-calendar") {
    const result = await searchFideCalendar({
      allowDateWindowFallback: Boolean(config.allowDateWindowFallback),
      country: config.country || "it",
      countryName: config.countryName || "Italy",
      endpoint: config.endpoint,
      fromDate: config.fromDate,
      limit: Number(config.limit || 25),
      monthsAhead: Number(config.monthsAhead || 12),
      rateLimitMs: Number(config.rateLimitMs || 1500),
      respectRobots: config.respectRobots !== false,
      timeoutMs: Number(config.timeoutMs || 20000),
      toDate: config.toDate,
      userAgent: process.env.SCRAPER_USER_AGENT || undefined
    });
    return { ...result, config };
  }

  if (source.type === "fide-rated-tournaments") {
    const result = await searchFideRatedTournaments({
      country: config.country || "ITA",
      countryName: config.countryName || "Italy",
      endpoint: config.endpoint,
      period: config.period || "current",
      limit: Number(config.limit || 25),
      rateLimitMs: Number(config.rateLimitMs || 1500),
      respectRobots: config.respectRobots !== false,
      timeoutMs: Number(config.timeoutMs || 20000),
      userAgent: process.env.SCRAPER_USER_AGENT || undefined
    });
    return { ...result, config };
  }

  if (source.type === "manual-review") {
    return searchManualReviewSource({
      reason: config.reason,
      sourceName: source.name,
      sourceUrl: config.sourceUrl || ""
    });
  }

  const error = new Error(`Unsupported scrape source type: ${source.type}`);
  error.status = 422;
  throw error;
};

const runScrapeSource = async (source, { mode = "dry-run", requestedBy = null, config = {} } = {}) => {
  assertPersistentStore();

  const resolvedMode = normalizeMode(mode);
  const job = await ScrapeJob.create({
    source: source._id,
    sourceName: source.name,
    sourceType: source.type,
    mode: resolvedMode,
    requestedBy,
    status: "running",
    startedAt: new Date(),
    configSnapshot: {
      ...(source.config || {}),
      ...config
    }
  });

  try {
    const scrapeResult = await runAdapter(source, config);
    const importResult =
      resolvedMode === "apply"
        ? await importTournamentMetadata(scrapeResult.tournaments)
        : {
            created: 0,
            updated: 0,
            results: [
              ...scrapeResult.tournaments.map((tournament) => ({
                action: "preview",
                id: tournament.originalId,
                slug: "",
                title: tournament.title,
                sourceUrl: tournament.sourceUrl
              })),
              ...(scrapeResult.skipped || []).map((item) => ({
                action: "skipped",
                id: item.id || "",
                slug: "",
                title: item.title || "",
                sourceUrl: item.sourceUrl || ""
              }))
            ]
          };

    job.status = "succeeded";
    job.finishedAt = new Date();
    job.sourceUrl = scrapeResult.sourceUrl || "";
    job.stats = {
      fetched: scrapeResult.tournaments.length,
      created: importResult.created,
      updated: importResult.updated,
      skipped: scrapeResult.skipped?.length || 0
    };
    job.warnings = scrapeResult.warnings || [];
    job.results = importResult.results.slice(0, 25);
    await job.save();

    source.lastRunAt = job.startedAt;
    source.lastSuccessAt = job.finishedAt;
    source.lastErrorAt = null;
    source.lastError = "";
    source.nextRunAt = addMinutes(job.finishedAt, source.intervalMinutes);
    source.lockedAt = null;
    source.lockedUntil = null;
    source.lockedBy = "";
    await source.save();

    return compactJob(job);
  } catch (error) {
    job.status = "failed";
    job.finishedAt = new Date();
    job.error = { message: error.message };
    await job.save();

    source.lastRunAt = job.startedAt;
    source.lastErrorAt = job.finishedAt;
    source.lastError = error.message;
    source.nextRunAt = addMinutes(job.finishedAt, source.intervalMinutes);
    source.lockedAt = null;
    source.lockedUntil = null;
    source.lockedBy = "";
    await source.save();

    throw error;
  }
};

const runScrapeSourceByKey = async (key, options = {}) => {
  assertPersistentStore();
  const source = await ScrapeSource.findOne({ key });
  if (!source) {
    const error = new Error(`Scrape source not found: ${key}`);
    error.status = 404;
    throw error;
  }
  return runScrapeSource(source, options);
};

const claimDueScrapeSource = async ({ workerId = workerName(), leaseMs = 10 * 60 * 1000 } = {}) => {
  assertPersistentStore();

  const now = new Date();
  return ScrapeSource.findOneAndUpdate(
    {
      enabled: true,
      $and: [
        { $or: [{ nextRunAt: null }, { nextRunAt: { $lte: now } }] },
        { $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }] }
      ]
    },
    {
      $set: {
        lockedAt: now,
        lockedUntil: new Date(now.getTime() + leaseMs),
        lockedBy: workerId
      }
    },
    {
      new: true,
      sort: { nextRunAt: 1, createdAt: 1 }
    }
  );
};

const runDueScrapeSources = async ({ mode = "apply", limit = 5, workerId = workerName(), leaseMs } = {}) => {
  assertPersistentStore();

  const jobs = [];
  const maxJobs = normalizeJobLimit(limit);
  for (let index = 0; index < maxJobs; index += 1) {
    const source = await claimDueScrapeSource({ workerId, leaseMs });
    if (!source) break;
    jobs.push(await runScrapeSource(source, { mode }));
  }

  return jobs;
};

module.exports = {
  DEFAULT_LICHESS_SOURCE,
  claimDueScrapeSource,
  compactJob,
  ensureDefaultScrapeSources,
  normalizeJobLimit,
  runDueScrapeSources,
  runScrapeSource,
  runScrapeSourceByKey
};
