require("dotenv").config();
const mongoose = require("mongoose");
const { connectDB } = require("../config/db");
const Event = require("../models/Event");
const ScrapeJob = require("../models/ScrapeJob");
const ScrapeSource = require("../models/ScrapeSource");

const readArg = (name, fallback = "") => {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);

  const index = process.argv.indexOf(`--${name}`);
  if (index !== -1) return process.argv[index + 1] || fallback;
  return fallback;
};

const todayIsoDate = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString().slice(0, 10);
};

const compactJob = (job) =>
  job
    ? {
        id: String(job._id),
        mode: job.mode,
        status: job.status,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
        stats: job.stats,
        warnings: job.warnings,
        error: job.error?.message || ""
      }
    : null;

const eventSourceNameByType = {
  "aicf-calendar": "AICF",
  chessarbiter: "ChessArbiter",
  "chessreg-api": "ChessReg",
  info64: "Info64",
  "lichess-broadcasts": "Lichess Broadcasts",
  vesus: "Vesus"
};

const eventSourceNamesFor = (source) =>
  [...new Set([source.name, eventSourceNameByType[source.type]].filter(Boolean))];

const groupBySource = async (activeFrom) => {
  const activeDate = new Date(activeFrom);
  const rows = await Event.aggregate([
    {
      $group: {
        _id: "$source.name",
        total: { $sum: 1 },
        active: {
          $sum: {
            $cond: [{ $gte: ["$endDate", activeDate] }, 1, 0]
          }
        }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  return new Map(rows.map((row) => [row._id || "", { total: row.total, active: row.active }]));
};

const duplicateCount = async (groupId, match) => {
  const [result] = await Event.aggregate([
    { $match: match },
    { $group: { _id: groupId, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $count: "duplicates" }
  ]);
  return result?.duplicates || 0;
};

const missingRequiredCount = () =>
  Event.countDocuments({
    $or: [
      { title: { $in: ["", null] } },
      { slug: { $in: ["", null] } },
      { city: { $in: ["", null] } },
      { country: { $in: ["", null] } },
      { startDate: { $in: ["", null] } },
      { endDate: { $in: ["", null] } },
      { "source.name": { $in: ["", null] } },
      { "source.originalId": { $in: ["", null] } }
    ]
  });

const main = async () => {
  await connectDB();

  const activeFrom = readArg("active-from", todayIsoDate());
  const [sources, sourceCounts, totalEvents, activeEvents, missingRequired, duplicateDedupeKeys, duplicateSourceIds] =
    await Promise.all([
      ScrapeSource.find({}).sort({ enabled: -1, key: 1 }).lean(),
      groupBySource(activeFrom),
      Event.countDocuments({}),
      Event.countDocuments({ endDate: { $gte: new Date(activeFrom) } }),
      missingRequiredCount(),
      duplicateCount("$dedupeKey", { dedupeKey: { $nin: ["", null] } }),
      duplicateCount(
        {
          sourceName: "$source.name",
          originalId: "$source.originalId"
        },
        {
          "source.name": { $nin: ["", null] },
          "source.originalId": { $nin: ["", null] }
        }
      )
    ]);

  const latestJobs = await Promise.all(
    sources.map((source) => ScrapeJob.findOne({ source: source._id }).sort({ startedAt: -1, createdAt: -1 }).lean())
  );

  const sourceReports = sources.map((source, index) => {
    const counts = eventSourceNamesFor(source).reduce(
      (total, sourceName) => {
        const item = sourceCounts.get(sourceName) || { total: 0, active: 0 };
        total.total += item.total;
        total.active += item.active;
        return total;
      },
      { total: 0, active: 0 }
    );
    return {
      key: source.key,
      name: source.name,
      type: source.type,
      enabled: source.enabled,
      accessType: source.config?.accessType || "",
      intervalMinutes: source.intervalMinutes,
      importedEvents: counts.total,
      activeEvents: counts.active,
      lastSuccessAt: source.lastSuccessAt,
      lastErrorAt: source.lastErrorAt,
      lastError: source.lastError,
      nextRunAt: source.nextRunAt,
      lockedUntil: source.lockedUntil,
      latestJob: compactJob(latestJobs[index])
    };
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        activeFrom,
        totals: {
          importedEvents: totalEvents,
          activeEvents,
          missingRequired,
          duplicateDedupeKeys,
          duplicateSourceIds
        },
        sources: sourceReports
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
