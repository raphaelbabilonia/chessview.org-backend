const todayIsoDate = (date = new Date()) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString().slice(0, 10);

const parseNonNegativeNumber = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
};

const staleDetailFilter = (staleHours, now = new Date()) => {
  const hours = parseNonNegativeNumber(staleHours, 0);
  if (hours <= 0) return null;

  const staleBefore = new Date(now.getTime() - hours * 60 * 60 * 1000);
  return {
    $or: [
      { "source.detailLastCheckedAt": { $exists: false } },
      { "source.detailLastCheckedAt": null },
      { "source.detailLastCheckedAt": { $lte: staleBefore } }
    ]
  };
};

const missingDetailFilter = () => ({
  $or: [
    { "source.detailStatus": { $exists: false } },
    { "source.detailStatus": { $in: ["", null, "empty", "failed"] } }
  ]
});

const buildDetailImportQuery = ({
  activeFrom = todayIsoDate(),
  includePast = false,
  missingDetailOnly = false,
  now = new Date(),
  source = "",
  staleHours = 6
} = {}) => {
  const query = {
    isPublic: true,
    "source.name": { $nin: ["", null] }
  };

  if (source) query["source.name"] = source;
  if (!includePast) query.endDate = { $gte: new Date(activeFrom) };

  const clauses = [];
  if (missingDetailOnly) clauses.push(missingDetailFilter());
  const stale = staleDetailFilter(staleHours, now);
  if (stale) clauses.push(stale);
  if (clauses.length) query.$and = clauses;

  return query;
};

const detailStatusForStats = (stats = {}) => {
  if (stats.players > 0 && (stats.rounds > 0 || stats.pairings > 0)) return "complete";
  if (stats.sections > 0 || stats.players > 0 || stats.rounds > 0 || stats.pairings > 0) return "partial";
  if (stats.documents > 0) return "documents-only";
  return "empty";
};

module.exports = {
  buildDetailImportQuery,
  detailStatusForStats,
  missingDetailFilter,
  staleDetailFilter,
  todayIsoDate
};
