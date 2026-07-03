const { getNewsItems, getNewsSources, newsItems } = require("../data/newsItems");
const NewsItem = require("../models/NewsItem");

const MAX_NEWS_LIMIT = 100;

const parsePositiveInt = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(Math.trunc(parsed), 1);
};

const publicNewsQuery = { isPublic: true, publishStatus: { $in: ["ready", "published"] } };

const serializeNews = (item) => ({
  id: item.slug || String(item._id),
  title: item.title,
  sourceName: item.sourceName,
  sourceHomeUrl: item.sourceHomeUrl,
  url: item.url || item.canonicalUrl || item.sourceUrl,
  imageUrl: item.imageUrl,
  publishedAt: item.publishedAt ? item.publishedAt.toISOString() : null,
  category: item.category,
  summary: item.summary
});

const getDbNewsSources = (items) =>
  Object.values(
    items.reduce((sources, item) => {
      const key = item.sourceName;
      sources[key] ||= {
        name: item.sourceName,
        url: item.sourceHomeUrl,
        count: 0
      };
      sources[key].count += 1;
      return sources;
    }, {})
  );

const listNews = async (req, res) => {
  const limit =
    req.query.limit === undefined ? MAX_NEWS_LIMIT : Math.min(parsePositiveInt(req.query.limit, MAX_NEWS_LIMIT), MAX_NEWS_LIMIT);
  const total = await NewsItem.countDocuments(publicNewsQuery);
  if (total > 0) {
    const [dbItems, sourceItems] = await Promise.all([
      NewsItem.find(publicNewsQuery).sort({ publishedAt: -1, createdAt: -1 }).limit(limit).lean(),
      NewsItem.find(publicNewsQuery).select("sourceName sourceHomeUrl").lean()
    ]);
    const data = dbItems.map(serializeNews);
    return res.json({
      success: true,
      data,
      meta: {
        count: data.length,
        total,
        sources: getDbNewsSources(sourceItems)
      }
    });
  }

  const data = getNewsItems({ limit: req.query.limit });

  res.json({
    success: true,
    data,
    meta: {
      count: data.length,
      total: newsItems.length,
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
