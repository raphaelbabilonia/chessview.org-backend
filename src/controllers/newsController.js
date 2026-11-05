const { getNewsItems, getNewsSources, newsItems } = require("../data/newsItems");
const NewsItem = require("../models/NewsItem");
const { publicNewsImageQuery } = require("../utils/newsImagePolicy");

const MAX_NEWS_LIMIT = 100;
const MAX_TEXT_FILTER_LENGTH = 120;
const NEWS_SEARCH_FIELDS = ["title", "summary", "sourceName", "author", "category", "tags", "relatedTournamentName", "relatedPlayerNames"];

const firstQueryValue = (value) => (Array.isArray(value) ? value[0] : value);

const queryText = (value) =>
  String(firstQueryValue(value) || "")
    .trim()
    .slice(0, MAX_TEXT_FILTER_LENGTH);

const literalRegex = (value) => new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

const pageMeta = (total, page, limit) => {
  const pages = Math.max(Math.ceil(total / limit), 1);
  return { page, pages, limit, hasNext: page < pages, hasPrev: page > 1 };
};

const parsePositiveInt = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(Math.trunc(parsed), 1);
};

const publicNewsQuery = {
  isPublic: true,
  publishStatus: { $in: ["ready", "published"] },
  ...publicNewsImageQuery
};

const isoDate = (value) => {
  if (!value) return null;
  if (typeof value.toISOString === "function") return value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const serializeNews = (item) => ({
  id: item.slug || item.id || String(item._id),
  title: item.title,
  description: item.summary,
  sourceName: item.sourceName,
  sourceHomeUrl: item.sourceHomeUrl,
  sourceUrl: item.sourceUrl,
  canonicalUrl: item.canonicalUrl,
  url: item.url || item.canonicalUrl || item.sourceUrl,
  author: item.author,
  imageUrl: item.imageUrl,
  publishedAt: isoDate(item.publishedAt),
  updatedAt: isoDate(item.updatedAt),
  language: item.language,
  region: item.region,
  category: item.category,
  summary: item.summary,
  summaryType: item.summaryType,
  tags: item.tags || [],
  relatedTournamentName: item.relatedTournamentName,
  relatedPlayerNames: item.relatedPlayerNames || [],
  relatedCoverage: (item.relatedCoverage || []).map((coverage) => ({
    sourceName: coverage.sourceName,
    url: coverage.url,
    relationship: coverage.relationship
  })),
  sourceLastCheckedAt: isoDate(item.sourceLastCheckedAt)
});

const getDbNewsSources = (items) =>
  Object.values(
    items.reduce((sources, item) => {
      const key = item.sourceName || "Unknown source";
      sources[key] ||= {
        name: key,
        url: item.sourceHomeUrl || item.sourceUrl || item.canonicalUrl || "",
        count: 0
      };
      sources[key].count += 1;
      return sources;
    }, {})
  ).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

const listNews = async (req, res) => {
  const limit =
    req.query.limit === undefined ? MAX_NEWS_LIMIT : Math.min(parsePositiveInt(req.query.limit, MAX_NEWS_LIMIT), MAX_NEWS_LIMIT);
  const page = parsePositiveInt(req.query.page, 1);
  const search = queryText(req.query.search);
  const source = queryText(req.query.source);
  const available = await NewsItem.countDocuments(publicNewsQuery);
  if (available > 0) {
    const filters = [
      publicNewsQuery,
      ...(search ? [{ $or: NEWS_SEARCH_FIELDS.map((field) => ({ [field]: literalRegex(search) })) }] : []),
      ...(source ? [{ sourceName: new RegExp(`^${literalRegex(source).source}$`, "i") }] : [])
    ];
    const filter = filters.length > 1 ? { $and: filters } : publicNewsQuery;
    const [dbItems, total, sourceItems] = await Promise.all([
      NewsItem.find(filter)
        .sort({ publishedAt: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      NewsItem.countDocuments(filter),
      NewsItem.find(publicNewsQuery).select("sourceName sourceHomeUrl").lean()
    ]);
    const data = dbItems.map(serializeNews);
    return res.json({
      success: true,
      data,
      meta: {
        count: data.length,
        total,
        ...pageMeta(total, page, limit),
        sources: getDbNewsSources(sourceItems)
      }
    });
  }

  const data = getNewsItems({ limit: req.query.limit }).map(serializeNews);

  res.json({
    success: true,
    data,
    meta: {
      count: data.length,
      total: newsItems.length,
      ...pageMeta(data.length, 1, limit),
      sources: getNewsSources(newsItems)
    }
  });
};

const listNewsSources = async (req, res) => {
  const dbItems = await NewsItem.find(publicNewsQuery).lean();
  const data = dbItems.length ? getDbNewsSources(dbItems) : getNewsSources();

  res.json({
    success: true,
    data,
    meta: {
      count: data.length
    }
  });
};

module.exports = {
  listNews,
  listNewsSources
};
