require("dotenv").config({ path: ".env.local", quiet: true });
require("dotenv").config({ quiet: true });

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { hasRequiredNewsImage } = require("../utils/newsImagePolicy");
const slugify = require("../utils/slugify");

const rootDir = path.resolve(__dirname, "../..");
const DEFAULT_WORKSPACE = "Codex News";
const USER_AGENT = "ChessViewNewsBridge/0.1 (+https://chessview.org; source-first discovery)";
const REQUEST_TIMEOUT_MS = 15000;
const DEFAULT_TARGET = 25;
const DEFAULT_MAX_SOURCES = 24;
const DEFAULT_MAX_SOURCE_ITEMS = 16;
const DEFAULT_STALE_DAYS = 45;
const SUMMARY_MAX_LENGTH = 520;
const EVIDENCE_EXCERPT_MAX_LENGTH = 360;

const allowedLanguages = new Set(["en", "it", "es", "fr", "de", "hi", "other"]);
const allowedRegions = new Set(["global", "europe", "usa", "italy", "india", "uk", "france", "germany", "spain", "canada", "other"]);

const feedHintsBySlug = {
  "all-india-chess-federation": ["https://aicf.in/feed/"],
  "chess-com-news": [
    "https://www.chess.com/news/rss",
    "https://www.chess.com/rss/news",
    "https://www.chess.com/news"
  ],
  "chessable-blog": ["https://www.chessable.com/blog/feed/"],
  "chessbase-news": ["https://en.chessbase.com/rss", "https://en.chessbase.com/feed"],
  "english-chess-federation": [
    "https://www.englishchess.org.uk/category/ecf-news/feed/",
    "https://www.englishchess.org.uk/feed/"
  ],
  "european-chess-union": ["https://www.europechess.org/feed/"],
  "fide-news": ["https://www.fide.com/feed/"],
  "lichess-blog": ["https://lichess.org/blog.atom"],
  "scacchierando": ["https://www.scacchierando.it/feed/"],
  "the-guardian-chess": ["https://www.theguardian.com/sport/chess/rss"],
  "us-chess-news": ["https://new.uschess.org/news/rss.xml", "https://new.uschess.org/rss.xml"]
};

const parseArgs = (argv) => {
  const args = {
    approve: true,
    dryRun: false,
    maxSourceItems: DEFAULT_MAX_SOURCE_ITEMS,
    maxSources: DEFAULT_MAX_SOURCES,
    sourceSlugs: [],
    staleDays: DEFAULT_STALE_DAYS,
    target: DEFAULT_TARGET,
    workspace: process.env.CHESSVIEW_NEWS_WORKSPACE || DEFAULT_WORKSPACE
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    const readValue = () => {
      index += 1;
      return next;
    };

    if (arg === "--allow-missing-image") throw new Error("--allow-missing-image is disabled: news articles require publisher images");
    else if (arg === "--candidates-only") args.approve = false;
    else if (arg === "--approve") args.approve = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--source") args.sourceSlugs.push(...String(readValue() || "").split(","));
    else if (arg.startsWith("--source=")) args.sourceSlugs.push(...arg.slice("--source=".length).split(","));
    else if (arg === "--target") args.target = Number(readValue());
    else if (arg.startsWith("--target=")) args.target = Number(arg.slice("--target=".length));
    else if (arg === "--max-sources") args.maxSources = Number(readValue());
    else if (arg.startsWith("--max-sources=")) args.maxSources = Number(arg.slice("--max-sources=".length));
    else if (arg === "--max-source-items") args.maxSourceItems = Number(readValue());
    else if (arg.startsWith("--max-source-items=")) args.maxSourceItems = Number(arg.slice("--max-source-items=".length));
    else if (arg === "--stale-days") args.staleDays = Number(readValue());
    else if (arg.startsWith("--stale-days=")) args.staleDays = Number(arg.slice("--stale-days=".length));
    else if (arg === "--workspace") args.workspace = readValue() || args.workspace;
    else if (arg.startsWith("--workspace=")) args.workspace = arg.slice("--workspace=".length);
  }

  args.sourceSlugs = args.sourceSlugs.map((value) => slugify(value, { fallback: "" })).filter(Boolean);
  args.target = Number.isFinite(args.target) && args.target > 0 ? Math.trunc(args.target) : DEFAULT_TARGET;
  args.maxSources = Number.isFinite(args.maxSources) && args.maxSources > 0 ? Math.trunc(args.maxSources) : DEFAULT_MAX_SOURCES;
  args.maxSourceItems =
    Number.isFinite(args.maxSourceItems) && args.maxSourceItems > 0
      ? Math.trunc(args.maxSourceItems)
      : DEFAULT_MAX_SOURCE_ITEMS;
  args.staleDays = Number.isFinite(args.staleDays) && args.staleDays > 0 ? Math.trunc(args.staleDays) : DEFAULT_STALE_DAYS;

  return args;
};

const workspacePath = (workspace, ...segments) => path.join(rootDir, workspace, ...segments);

const toPosix = (value) => value.split(path.sep).join("/");

const ensureDir = (directory) => {
  fs.mkdirSync(directory, { recursive: true });
};

const readJson = (file, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
};

const writeJson = (file, data) => {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
};

const listJsonFiles = (directory) => {
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return listJsonFiles(fullPath);
      return entry.isFile() && entry.name.endsWith(".json") ? [fullPath] : [];
    })
    .sort();
};

const unique = (values) => {
  const seen = new Set();
  return values.filter((value) => {
    const key = String(value || "").trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const decodeEntities = (value = "") => {
  const named = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
    rsquo: "'",
    lsquo: "'",
    rdquo: '"',
    ldquo: '"'
  };

  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => named[name.toLowerCase()] || match);
};

const stripHtml = (value = "") =>
  decodeEntities(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const truncateAtWord = (value, maxLength) => {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  const clipped = text.slice(0, maxLength - 1).replace(/\s+\S*$/, "").trim();
  return `${clipped || text.slice(0, maxLength - 1).trim()}...`;
};

const lowerFirst = (value) => {
  const text = String(value || "").trim();
  return text ? `${text.charAt(0).toLowerCase()}${text.slice(1)}` : text;
};

const absoluteUrl = (value, baseUrl) => {
  try {
    return new URL(decodeEntities(value), baseUrl).toString();
  } catch {
    return "";
  }
};

const originFromUrl = (value) => {
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
};

const hostnameFromUrl = (value) => {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

const tagContent = (xml, tag) => {
  const match = String(xml).match(new RegExp(`<${escapeRegExp(tag)}\\b[^>]*>([\\s\\S]*?)<\\/${escapeRegExp(tag)}>`, "i"));
  return match ? decodeEntities(match[1]).trim() : "";
};

const firstTagContent = (xml, tags) => {
  for (const tag of tags) {
    const value = tagContent(xml, tag);
    if (value) return value;
  }
  return "";
};

const attrsFromTag = (tag = "") => {
  const attrs = {};
  const attrPattern = /([:@a-zA-Z0-9_-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match = attrPattern.exec(tag);
  while (match) {
    attrs[match[1].toLowerCase()] = decodeEntities(match[3] || match[4] || match[5] || "");
    match = attrPattern.exec(tag);
  }
  return attrs;
};

const firstTagAttrs = (xml, tag) => {
  const match = String(xml).match(new RegExp(`<${escapeRegExp(tag)}\\b([^>]*)>`, "i"));
  return match ? attrsFromTag(match[1]) : {};
};

const htmlMeta = (html) => {
  const meta = {};
  const metaPattern = /<meta\b([^>]*?)>/gi;
  let match = metaPattern.exec(html);
  while (match) {
    const attrs = attrsFromTag(match[1]);
    const key = (attrs.property || attrs.name || "").toLowerCase();
    if (key && attrs.content && !meta[key]) meta[key] = attrs.content;
    match = metaPattern.exec(html);
  }

  const canonicalMatch = html.match(/<link\b([^>]*?)>/gi)?.find((tag) => {
    const attrs = attrsFromTag(tag);
    return String(attrs.rel || "").toLowerCase() === "canonical";
  });
  if (canonicalMatch) {
    meta.canonical = attrsFromTag(canonicalMatch).href || "";
  }

  return meta;
};

const parseDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const dateIso = (value) => {
  const date = parseDate(value);
  return date ? date.toISOString() : "";
};

const datePart = (value) => {
  const date = parseDate(value);
  return date ? date.toISOString().slice(0, 10) : "unknown";
};

const isStale = (value, staleDays) => {
  const date = parseDate(value);
  if (!date) return false;
  return Date.now() - date.getTime() > staleDays * 24 * 60 * 60 * 1000;
};

const fetchText = async (url) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8, */*;q=0.5",
        "User-Agent": USER_AGENT
      },
      redirect: "follow",
      signal: controller.signal
    });
    const text = await response.text();
    return {
      contentType: response.headers.get("content-type") || "",
      finalUrl: response.url || url,
      ok: response.ok,
      status: response.status,
      text
    };
  } finally {
    clearTimeout(timeout);
  }
};

const isFeedResponse = ({ contentType, text }) =>
  /rss|atom|xml/i.test(contentType || "") || /<(rss|feed)\b/i.test(String(text || "").slice(0, 500));

const feedUrlsForSource = (source) => {
  const hints = feedHintsBySlug[source.slug] || [];
  const sourceUrl = String(source.url || "").replace(/\/+$/, "");
  const origin = originFromUrl(source.url);
  const candidates = [
    ...hints,
    `${sourceUrl}/feed/`,
    `${sourceUrl}/rss/`,
    `${sourceUrl}/atom.xml`,
    `${origin}/feed/`,
    `${origin}/rss.xml`,
    `${origin}/atom.xml`
  ];

  return unique(candidates.filter((url) => /^https?:\/\//i.test(url)));
};

const itemImageFromBlock = (block, baseUrl) => {
  const mediaContent = firstTagAttrs(block, "media:content");
  if (mediaContent.url && (!mediaContent.type || /^image\//i.test(mediaContent.type))) return absoluteUrl(mediaContent.url, baseUrl);

  const mediaThumbnail = firstTagAttrs(block, "media:thumbnail");
  if (mediaThumbnail.url) return absoluteUrl(mediaThumbnail.url, baseUrl);

  const enclosure = firstTagAttrs(block, "enclosure");
  if (enclosure.url && (!enclosure.type || /^image\//i.test(enclosure.type) || /\.(png|jpe?g|webp|gif)(\?|$)/i.test(enclosure.url))) {
    return absoluteUrl(enclosure.url, baseUrl);
  }

  const imageUrl = tagContent(block, "url");
  return /\.(png|jpe?g|webp|gif)(\?|$)/i.test(imageUrl) ? absoluteUrl(imageUrl, baseUrl) : "";
};

const extractRssItem = (block, feedUrl, source) => {
  const link = firstTagContent(block, ["link"]);
  const sourceUrl = absoluteUrl(link, feedUrl);
  return {
    author: stripHtml(firstTagContent(block, ["dc:creator", "author"])),
    description: stripHtml(firstTagContent(block, ["description", "content:encoded", "summary"])),
    imageUrl: itemImageFromBlock(block, feedUrl),
    originalId: stripHtml(firstTagContent(block, ["guid", "id"])) || sourceUrl,
    publishedAt: dateIso(firstTagContent(block, ["pubDate", "published", "updated", "dc:date"])),
    sourceName: source.name,
    sourceUrl,
    title: stripHtml(firstTagContent(block, ["title"]))
  };
};

const extractAtomItem = (block, feedUrl, source) => {
  const linkTags = block.match(/<link\b[^>]*>/gi) || [];
  const alternateLink =
    linkTags
      .map((tag) => attrsFromTag(tag))
      .find((attrs) => !attrs.rel || attrs.rel === "alternate" || attrs.rel === "canonical") || {};
  const sourceUrl = absoluteUrl(alternateLink.href || tagContent(block, "link"), feedUrl);

  return {
    author: stripHtml(firstTagContent(block, ["name", "author"])),
    description: stripHtml(firstTagContent(block, ["summary", "content"])),
    imageUrl: itemImageFromBlock(block, feedUrl),
    originalId: stripHtml(firstTagContent(block, ["id"])) || sourceUrl,
    publishedAt: dateIso(firstTagContent(block, ["published", "updated"])),
    sourceName: source.name,
    sourceUrl,
    title: stripHtml(firstTagContent(block, ["title"]))
  };
};

const parseFeedItems = (xml, feedUrl, source) => {
  const rssItems = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
  if (rssItems.length) return rssItems.map((block) => extractRssItem(block, feedUrl, source));

  const atomItems = xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
  return atomItems.map((block) => extractAtomItem(block, feedUrl, source));
};

const extractArticleMetadata = (html, articleUrl, source) => {
  const meta = htmlMeta(html);
  const fallbackTitle = stripHtml((html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "");
  const canonicalUrl = absoluteUrl(meta.canonical || meta["og:url"] || articleUrl, articleUrl);
  const imageUrl = absoluteUrl(meta["og:image"] || meta["twitter:image"] || "", articleUrl);
  const publishedAt = dateIso(meta["article:published_time"] || meta["date"] || meta["pubdate"]);

  return {
    author: meta.author || meta["article:author"] || "",
    canonicalUrl,
    description: stripHtml(meta["og:description"] || meta.description || meta["twitter:description"] || ""),
    imageUrl,
    originalId: canonicalUrl || articleUrl,
    publishedAt,
    sourceName: source.name,
    sourceUrl: articleUrl,
    title: stripHtml(meta["og:title"] || meta["twitter:title"] || fallbackTitle),
    updatedAt: dateIso(meta["article:modified_time"] || meta.updated_time || "")
  };
};

const isLikelyArticleUrl = (url, source) => {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  if (/\.(css|js|json|png|jpe?g|gif|webp|svg|ico|pdf|zip|mp4|mp3)(\?|$)/i.test(url)) return false;
  const origin = originFromUrl(source.url);
  if (origin && originFromUrl(url) !== origin) return false;
  return /news|post|blog|article|aktu|actu|noticias|comunicati|view|bericht|team-news|bspnews/i.test(url);
};

const listingLinks = (html, baseUrl, source) => {
  const links = [];
  const linkPattern = /<a\b([^>]*?)>([\s\S]*?)<\/a>/gi;
  let match = linkPattern.exec(html);
  while (match) {
    const attrs = attrsFromTag(match[1]);
    const text = stripHtml(match[2]);
    const url = absoluteUrl(attrs.href || "", baseUrl).replace(/#.*$/, "");
    if (text.length >= 8 && isLikelyArticleUrl(url, source)) links.push({ text, url });
    match = linkPattern.exec(html);
  }

  const seen = new Set();
  return links.filter((link) => {
    if (seen.has(link.url)) return false;
    seen.add(link.url);
    return true;
  });
};

const languageForSource = (source) => {
  const text = `${source.slug} ${source.name} ${source.region}`.toLowerCase();
  if (/italy|italian|federscacchi|scacchierando/.test(text)) return "it";
  if (/spain|spanish|feda|noticias/.test(text)) return "es";
  if (/france|french|echecs|europe-echecs/.test(text)) return "fr";
  if (/germany|german|deutscher|schachbund/.test(text)) return "de";
  if (/india|hindi/.test(text)) return source.slug === "all-india-chess-federation" ? "en" : "en";
  return "en";
};

const regionForSource = (source) => {
  const text = `${source.slug} ${source.name} ${source.region}`.toLowerCase();
  if (/usa|united states|us chess/.test(text)) return "usa";
  if (/italy|federscacchi|scacchierando/.test(text)) return "italy";
  if (/india|aicf/.test(text)) return "india";
  if (/uk|england|guardian|english/.test(text)) return "uk";
  if (/france|french|echecs/.test(text)) return "france";
  if (/germany|deutscher/.test(text)) return "germany";
  if (/spain|feda/.test(text)) return "spain";
  if (/canada/.test(text)) return "canada";
  if (/europe|ecu/.test(text)) return "europe";
  return "global";
};

const categoryFromText = (title, description = "") => {
  const text = `${title} ${description}`.toLowerCase();
  if (/fide|olympiad|federation|commission|election|president|rating/.test(text)) return "fide";
  if (/championship|tournament|open|rapid|blitz|cup|league|grand prix|round|winner|wins|qualif/.test(text)) {
    return "tournament";
  }
  if (/school|youth|junior|education|training|course|lesson|academy|chessable/.test(text)) return "education";
  if (/platform|app|feature|software|technology|ai|engine|broadcast|online rating/.test(text)) return "technology";
  if (/interview|podcast|conversation/.test(text)) return "interview";
  if (/opinion|column/.test(text)) return "opinion";
  if (/player|grandmaster|gm|im\b|master|carlsen|nakamura/.test(text)) return "player";
  if (/online|bullet|arena|titled tuesday|freestyle friday/.test(text)) return "online";
  return "other";
};

const tagsForItem = (source, category, title) => {
  const stopWords = new Set(["the", "and", "for", "with", "from", "into", "after", "before", "chess"]);
  const titleTags = String(title || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 4 && !stopWords.has(word))
    .slice(0, 5);
  return unique([source.slug, category, ...titleTags]).slice(0, 8);
};

const buildSummary = (source, item, category) => {
  const title = truncateAtWord(stripHtml(item.title), 180).replace(/[.!?]+$/, "");
  const categoryText = category === "other" ? "chess news" : `${category} news`;
  const sourceName = source.name || item.sourceName || hostnameFromUrl(item.sourceUrl) || "The source";
  const base = `${sourceName} reports on ${lowerFirst(title || "a new chess story")}.`;
  const context = `This ChessView bridge card captures the source, date, image, and link for a quick ${categoryText} overview before readers open the original article.`;
  return truncateAtWord(`${base} ${context}`, SUMMARY_MAX_LENGTH);
};

const itemHash = (item) =>
  crypto
    .createHash("sha256")
    .update([item.canonicalUrl, item.title, item.summary, item.publishedAt || ""].join("|"))
    .digest("hex");

const normalizeDiscoveredItem = (source, rawItem, capturedAt) => {
  const sourceUrl = rawItem.sourceUrl || rawItem.canonicalUrl;
  const canonicalUrl = rawItem.canonicalUrl || sourceUrl;
  const title = truncateAtWord(stripHtml(rawItem.title), 220);
  const category = categoryFromText(title, rawItem.description);
  const slug = slugify(title, { fallback: `${source.slug}-news`, maxLength: 96 });
  const publishedAt = rawItem.publishedAt || "";
  const summary = buildSummary(source, { ...rawItem, title, sourceUrl }, category);
  const language = allowedLanguages.has(languageForSource(source)) ? languageForSource(source) : "other";
  const region = allowedRegions.has(regionForSource(source)) ? regionForSource(source) : "other";

  const item = {
    schemaVersion: 1,
    title,
    slug,
    summary,
    summaryType: "generated",
    sourceName: source.name,
    sourceUrl,
    canonicalUrl,
    author: truncateAtWord(rawItem.author || "", 120),
    publishedAt,
    updatedAt: rawItem.updatedAt || "",
    language,
    region,
    category,
    imageUrl: rawItem.imageUrl || "",
    tags: tagsForItem(source, category, title),
    relatedCoverage: [],
    originalId: `${source.slug}-${datePart(publishedAt)}-${slug}`,
    confidence: rawItem.fromListing ? 0.78 : 0.84,
    qualityFlags: [],
    evidenceRefs: [],
    dedupeKey: `${datePart(publishedAt)}|${source.slug}|${slug}`,
    lastCheckedAt: capturedAt,
    approvedAt: capturedAt,
    approvedBy: "codex-news-automation",
    publishStatus: "ready"
  };

  if (!item.author) item.qualityFlags.push("missing_author");
  if (!item.publishedAt) item.qualityFlags.push("missing_published_at");
  item.contentHash = itemHash(item);

  return item;
};

const collectFingerprints = (workspace) => {
  const dedupeState = readJson(workspacePath(workspace, "state", "dedupe-index.json"), {});
  const seenState = readJson(workspacePath(workspace, "state", "seen-urls.json"), {});
  const fingerprints = {
    canonicalUrls: new Set(Object.keys(dedupeState.keys?.byCanonicalUrl || {})),
    contentHashes: new Set(Object.keys(dedupeState.keys?.byContentHash || {})),
    dedupeKeys: new Set(),
    sourceUrls: new Set(Object.keys(dedupeState.keys?.bySourceUrl || {})),
    titleKeys: new Set(Object.keys(dedupeState.keys?.byTitleDate || {}))
  };

  for (const entry of seenState.urls || []) {
    if (entry.url) fingerprints.sourceUrls.add(entry.url);
    if (entry.canonicalUrl) fingerprints.canonicalUrls.add(entry.canonicalUrl);
    if (entry.dedupeKey) fingerprints.dedupeKeys.add(entry.dedupeKey);
  }

  for (const file of listJsonFiles(workspacePath(workspace, "approved"))) {
    const item = readJson(file, null);
    if (!item) continue;
    if (item.sourceUrl) fingerprints.sourceUrls.add(item.sourceUrl);
    if (item.canonicalUrl) fingerprints.canonicalUrls.add(item.canonicalUrl);
    if (item.dedupeKey) fingerprints.dedupeKeys.add(item.dedupeKey);
    if (item.contentHash) fingerprints.contentHashes.add(item.contentHash);
    if (item.title && item.publishedAt) {
      fingerprints.titleKeys.add(`${datePart(item.publishedAt)}|${slugify(item.title, { fallback: "news" })}`);
    }
  }

  return fingerprints;
};

const isDuplicate = (item, fingerprints) => {
  const titleKey = `${datePart(item.publishedAt)}|${slugify(item.title, { fallback: "news" })}`;
  if (item.sourceUrl && fingerprints.sourceUrls.has(item.sourceUrl)) return "source URL already seen";
  if (item.canonicalUrl && fingerprints.canonicalUrls.has(item.canonicalUrl)) return "canonical URL already seen";
  if (item.dedupeKey && fingerprints.dedupeKeys.has(item.dedupeKey)) return "dedupe key already seen";
  if (item.contentHash && fingerprints.contentHashes.has(item.contentHash)) return "content hash already seen";
  if (fingerprints.titleKeys.has(titleKey)) return "title/date already seen";
  return "";
};

const rememberFingerprint = (item, fingerprints) => {
  const titleKey = `${datePart(item.publishedAt)}|${slugify(item.title, { fallback: "news" })}`;
  if (item.sourceUrl) fingerprints.sourceUrls.add(item.sourceUrl);
  if (item.canonicalUrl) fingerprints.canonicalUrls.add(item.canonicalUrl);
  if (item.dedupeKey) fingerprints.dedupeKeys.add(item.dedupeKey);
  if (item.contentHash) fingerprints.contentHashes.add(item.contentHash);
  fingerprints.titleKeys.add(titleKey);
};

const validateCandidate = (item, args, fingerprints) => {
  if (!item.title || !item.sourceUrl || !item.canonicalUrl) return "missing title or source URL";
  if (isStale(item.publishedAt, args.staleDays)) return `older than ${args.staleDays} days`;
  if (!hasRequiredNewsImage(item.imageUrl)) return "missing publisher image";
  if (/subscribe|subscription|paywall|sign in to continue/i.test(`${item.summary} ${item.title}`)) return "possible paywall";
  return isDuplicate(item, fingerprints);
};

const discoverFromFeeds = async (source, args, manifest) => {
  const items = [];
  for (const feedUrl of feedUrlsForSource(source)) {
    try {
      const response = await fetchText(feedUrl);
      manifest.queryUsed.push(feedUrl);
      manifest.urlsVisited.push({
        url: feedUrl,
        canonicalUrl: response.finalUrl,
        checkedAt: new Date().toISOString(),
        status: response.ok ? "visited" : "error",
        notes: `HTTP ${response.status}`
      });
      if (!response.ok || !isFeedResponse(response)) continue;

      const parsed = parseFeedItems(response.text, response.finalUrl || feedUrl, source)
        .filter((item) => item.title && item.sourceUrl)
        .slice(0, args.maxSourceItems);
      items.push(...parsed);
      if (items.length >= args.maxSourceItems) break;
    } catch (error) {
      manifest.errors.push({ message: error.message, severity: "warning", url: feedUrl });
    }
  }

  return items;
};

const enrichItemWithArticleMetadata = async (source, item, manifest) => {
  if (!item.sourceUrl) return item;
  try {
    const response = await fetchText(item.sourceUrl);
    manifest.urlsVisited.push({
      url: item.sourceUrl,
      canonicalUrl: response.finalUrl,
      checkedAt: new Date().toISOString(),
      status: response.ok ? "visited" : "error",
      notes: item.imageUrl ? "metadata check" : "metadata and image check"
    });
    if (!response.ok || !/html/i.test(response.contentType || "")) return item;
    const metadata = extractArticleMetadata(response.text, response.finalUrl || item.sourceUrl, source);
    return {
      ...item,
      author: item.author || metadata.author,
      canonicalUrl: metadata.canonicalUrl || item.canonicalUrl,
      description: item.description || metadata.description,
      imageUrl: item.imageUrl || metadata.imageUrl,
      publishedAt: item.publishedAt || metadata.publishedAt,
      title: item.title || metadata.title,
      updatedAt: item.updatedAt || metadata.updatedAt
    };
  } catch (error) {
    manifest.errors.push({ message: error.message, severity: "warning", url: item.sourceUrl });
    return item;
  }
};

const discoverFromListing = async (source, args, manifest) => {
  const response = await fetchText(source.url);
  manifest.queryUsed.push(source.url);
  manifest.urlsVisited.push({
    url: source.url,
    canonicalUrl: response.finalUrl,
    checkedAt: new Date().toISOString(),
    status: response.ok ? "visited" : "error",
    notes: "listing fallback"
  });
  if (!response.ok || !/html/i.test(response.contentType || "")) return [];

  const links = listingLinks(response.text, response.finalUrl || source.url, source).slice(0, args.maxSourceItems);
  const items = [];
  for (const link of links) {
    try {
      const page = await fetchText(link.url);
      manifest.urlsVisited.push({
        url: link.url,
        canonicalUrl: page.finalUrl,
        checkedAt: new Date().toISOString(),
        status: page.ok ? "visited" : "error",
        notes: "article metadata fallback"
      });
      if (!page.ok || !/html/i.test(page.contentType || "")) continue;
      items.push({ ...extractArticleMetadata(page.text, page.finalUrl || link.url, source), fromListing: true });
    } catch (error) {
      manifest.errors.push({ message: error.message, severity: "warning", url: link.url });
    }
  }

  return items;
};

const discoverSourceItems = async (source, args, manifest) => {
  const feedItems = await discoverFromFeeds(source, args, manifest);
  const enriched = [];
  for (const item of feedItems) {
    enriched.push(await enrichItemWithArticleMetadata(source, item, manifest));
  }
  if (enriched.length) return enriched;
  if (!source.accessModes?.includes("manual_web_review")) return [];
  return discoverFromListing(source, args, manifest);
};

const evidenceMarkdown = (item, source, rawDescription) => [
  `# ${item.title}`,
  "",
  `Source: ${source.name}`,
  `Source URL: ${item.sourceUrl}`,
  `Canonical URL: ${item.canonicalUrl}`,
  `Captured at: ${item.lastCheckedAt}`,
  `Published at: ${item.publishedAt || "unknown"}`,
  `Image URL: ${item.imageUrl || "missing"}`,
  "",
  "Excerpt:",
  truncateAtWord(stripHtml(rawDescription || item.title), EVIDENCE_EXCERPT_MAX_LENGTH),
  "",
  "Notes:",
  "Source-first bridge metadata only. No full article text, transcript, PGN collection, or paywalled content stored."
].join("\n");

const updateSeenState = (workspace, item, status, file) => {
  const stateFile = workspacePath(workspace, "state", "seen-urls.json");
  const state = readJson(stateFile, { schemaVersion: 1, updatedAt: "", urls: [] });
  state.urls ||= [];
  state.urls.push({
    url: item.sourceUrl,
    canonicalUrl: item.canonicalUrl,
    sourceName: item.sourceName,
    dedupeKey: item.dedupeKey,
    lastSeenAt: item.lastCheckedAt,
    status,
    file
  });
  state.updatedAt = item.lastCheckedAt;
  writeJson(stateFile, state);
};

const updateDedupeState = (workspace, item, file) => {
  const stateFile = workspacePath(workspace, "state", "dedupe-index.json");
  const state = readJson(stateFile, { schemaVersion: 1, updatedAt: "", keys: {}, items: [] });
  state.keys ||= {};
  state.keys.byCanonicalUrl ||= {};
  state.keys.bySourceUrl ||= {};
  state.keys.byContentHash ||= {};
  state.keys.byTitleDate ||= {};
  state.items ||= [];

  const titleKey = `${datePart(item.publishedAt)}|${slugify(item.title, { fallback: "news" })}`;
  if (item.canonicalUrl) state.keys.byCanonicalUrl[item.canonicalUrl] = item.dedupeKey;
  if (item.sourceUrl) state.keys.bySourceUrl[item.sourceUrl] = item.dedupeKey;
  if (item.contentHash) state.keys.byContentHash[item.contentHash] = item.dedupeKey;
  state.keys.byTitleDate[titleKey] = item.dedupeKey;
  state.items.push({
    dedupeKey: item.dedupeKey,
    title: item.title,
    sourceName: item.sourceName,
    sourceUrl: item.sourceUrl,
    canonicalUrl: item.canonicalUrl,
    originalId: item.originalId,
    contentHash: item.contentHash,
    publishedAt: item.publishedAt,
    file
  });
  state.updatedAt = item.lastCheckedAt;
  writeJson(stateFile, state);
};

const upsertSourceState = (workspace, source, patch) => {
  const healthFile = workspacePath(workspace, "state", "source-health.json");
  const health = readJson(healthFile, { schemaVersion: 1, updatedAt: "", sources: [] });
  health.sources ||= [];
  const existing = health.sources.find((entry) => entry.sourceSlug === source.slug);
  const cleanPatch = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
  if (existing) Object.assign(existing, cleanPatch);
  else health.sources.push({ sourceSlug: source.slug, sourceName: source.name, ...cleanPatch });
  health.updatedAt = patch.lastCheckedAt;
  writeJson(healthFile, health);

  const lastRunsFile = workspacePath(workspace, "state", "last-runs.json");
  const lastRuns = readJson(lastRunsFile, { schemaVersion: 1, updatedAt: "", sources: [] });
  lastRuns.sources ||= [];
  const lastRun = lastRuns.sources.find((entry) => entry.sourceSlug === source.slug);
  const nextSuggestedAt = new Date(new Date(patch.lastCheckedAt).getTime() + 60 * 60 * 1000).toISOString();
  const runPatch = {
    sourceSlug: source.slug,
    lastRunId: patch.lastRunId,
    lastRunAt: patch.lastCheckedAt,
    nextSuggestedAt
  };
  if (lastRun) Object.assign(lastRun, runPatch);
  else lastRuns.sources.push(runPatch);
  lastRuns.updatedAt = patch.lastCheckedAt;
  writeJson(lastRunsFile, lastRuns);
};

const sourceSort = (a, b) => a.priorityGroup - b.priorityGroup || a.rank - b.rank || a.name.localeCompare(b.name);

const selectSources = (registry, args) => {
  const requested = new Set(args.sourceSlugs);
  return (registry.sources || [])
    .filter((source) => source.status !== "avoid" && source.role !== "avoid_primary")
    .filter((source) => requested.size === 0 || requested.has(source.slug))
    .filter((source) => source.role === "primary" || source.accessModes?.includes("rss_review"))
    .sort(sourceSort)
    .slice(0, args.maxSources);
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const workspace = args.workspace;
  const registryFile = workspacePath(workspace, "sources", "priority-sources.json");
  const registry = readJson(registryFile, null);
  if (!registry) throw new Error(`Missing source registry: ${registryFile}`);

  const sources = selectSources(registry, args);
  if (!sources.length) throw new Error("No matching news sources selected");

  const startedAt = new Date();
  const day = startedAt.toISOString().slice(0, 10);
  const hm = startedAt.toISOString().slice(11, 16).replace(":", "");
  const runSlug = `${hm}-automated-news-discovery`;
  const runId = `${day}T${runSlug}`;
  const runDir = workspacePath(workspace, "runs", day, runSlug);
  const approvedDir = workspacePath(workspace, "approved", day);
  const candidatesDir = workspacePath(workspace, "candidates");

  if (!args.dryRun) {
    ensureDir(runDir);
    ensureDir(approvedDir);
    ensureDir(candidatesDir);
  }

  const manifest = {
    schemaVersion: 1,
    runId,
    sourceSlug: "multiple-priority-sources",
    sourceName: "Multiple priority chess news sources",
    objective: `Discover up to ${args.target} source-first chess news bridge records with publisher images.`,
    startedAt: startedAt.toISOString(),
    finishedAt: null,
    status: "running",
    agent: "codex-news-automation",
    queryUsed: [],
    urlsVisited: [],
    evidenceFiles: [],
    candidatesCreated: [],
    rejectedItems: [],
    errors: [],
    nextSuggestion: ""
  };

  const fingerprints = collectFingerprints(workspace);
  const accepted = [];

  for (const source of sources) {
    if (accepted.length >= args.target) break;
    const checkedAt = new Date().toISOString();
    let sourceAccepted = 0;
    let sourceRejected = 0;

    try {
      const rawItems = await discoverSourceItems(source, args, manifest);
      for (const rawItem of rawItems) {
        if (accepted.length >= args.target) break;
        const capturedAt = new Date().toISOString();
        const item = normalizeDiscoveredItem(source, rawItem, capturedAt);
        const reason = validateCandidate(item, args, fingerprints);
        if (reason) {
          sourceRejected += 1;
          manifest.rejectedItems.push({
            fingerprint: item.dedupeKey || item.sourceUrl || item.title || source.slug,
            reason
          });
          continue;
        }

        const safeFileBase = `${day}__${source.slug}__${item.slug}`;
        const evidenceName = `evidence-${String(manifest.evidenceFiles.length + 1).padStart(3, "0")}-${source.slug}-${item.slug}.md`;
        const evidencePath = path.join(runDir, evidenceName);
        const evidenceRelative = toPosix(path.relative(workspacePath(workspace), evidencePath));
        item.evidenceRefs = [
          {
            refId: `ev-${String(manifest.evidenceFiles.length + 1).padStart(3, "0")}`,
            path: evidenceRelative,
            sourceUrl: item.sourceUrl,
            canonicalUrl: item.canonicalUrl,
            capturedAt: item.lastCheckedAt,
            excerpt: truncateAtWord(stripHtml(rawItem.description || item.title), EVIDENCE_EXCERPT_MAX_LENGTH),
            notes: "Automated source-first RSS/metadata discovery; no full article text stored."
          }
        ];

        const candidatePath = path.join(candidatesDir, `${safeFileBase}.json`);
        const candidateRelative = toPosix(path.relative(workspacePath(workspace), candidatePath));
        const approvedPath = path.join(approvedDir, `${safeFileBase}.json`);
        const approvedRelative = toPosix(path.relative(workspacePath(workspace), approvedPath));

        if (!args.dryRun) {
          fs.writeFileSync(evidencePath, `${evidenceMarkdown(item, source, rawItem.description)}\n`, "utf8");
          writeJson(candidatePath, item);
          if (args.approve) writeJson(approvedPath, item);
          updateSeenState(workspace, item, args.approve ? "approved" : "candidate", args.approve ? approvedRelative : candidateRelative);
          updateDedupeState(workspace, item, args.approve ? approvedRelative : candidateRelative);
        }

        manifest.evidenceFiles.push(evidenceRelative);
        manifest.candidatesCreated.push(candidateRelative);
        accepted.push({ item, file: args.approve ? approvedRelative : candidateRelative });
        rememberFingerprint(item, fingerprints);
        sourceAccepted += 1;
      }

      if (!args.dryRun) {
        upsertSourceState(workspace, source, {
          sourceName: source.name,
          status: sourceAccepted ? "completed" : "completed_with_warnings",
          lastCheckedAt: checkedAt,
          lastSuccessfulAt: sourceAccepted ? checkedAt : undefined,
          lastRunId: runId,
          consecutiveErrors: 0,
          notes: sourceAccepted
            ? `Automated discovery accepted ${sourceAccepted} item(s); rejected ${sourceRejected}.`
            : `Automated discovery found no publishable item; rejected ${sourceRejected}.`
        });
      }
    } catch (error) {
      manifest.errors.push({ message: error.message, severity: "error", url: source.url });
      if (!args.dryRun) {
        upsertSourceState(workspace, source, {
          sourceName: source.name,
          status: "completed_with_warnings",
          lastCheckedAt: checkedAt,
          lastSuccessfulAt: null,
          lastRunId: runId,
          consecutiveErrors: 1,
          notes: error.message
        });
      }
    }
  }

  manifest.finishedAt = new Date().toISOString();
  manifest.status =
    manifest.errors.some((error) => error.severity === "error") || accepted.length < args.target
      ? "completed_with_warnings"
      : "completed";
  manifest.nextSuggestion = accepted.length
    ? `Review ${accepted.length} ${args.approve ? "approved" : "candidate"} item(s), then run npm run agent:publish -- --domain news.`
    : "No publishable news records were created; expand sources or review rejected items with missing publisher images.";

  if (!args.dryRun) writeJson(path.join(runDir, "run-manifest.json"), manifest);

  console.log(
    JSON.stringify(
      {
        ok: manifest.status !== "failed",
        dryRun: args.dryRun,
        approved: args.approve ? accepted.length : 0,
        candidates: accepted.length,
        rejected: manifest.rejectedItems.length,
        errors: manifest.errors.length,
        run: toPosix(path.relative(rootDir, runDir))
      },
      null,
      2
    )
  );
};

main().catch((error) => {
  console.error(`News discovery failed: ${error.message}`);
  process.exit(1);
});
