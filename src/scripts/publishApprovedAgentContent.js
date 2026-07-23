require("dotenv").config({ path: ".env.local", quiet: true });
require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");
const { REQUIRED_NEWS_IMAGE_REASON, hasRequiredNewsImage } = require("../utils/newsImagePolicy");
const { isSyntheticTestEvent } = require("../utils/syntheticTestEvents");
const { canonicalFamilySignature, normalizeText } = require("../utils/tournamentIdentity");
const { createPublishPlan } = require("../utils/publishPlan");
const { normalizeApiRoot } = require("../utils/chessviewApiUrl");

const rootDir = path.resolve(__dirname, "../..");
const TIME_CONTROL_PRIORITY = {
  mixed: 5,
  standard: 4,
  classical: 4,
  rapid: 3,
  unknown: 2,
  blitz: 1,
  bullet: 1
};
const MAX_AGENT_INGEST_BATCH_BYTES = Number(process.env.CHESSVIEW_AGENT_INGEST_MAX_BATCH_BYTES || 750000);
const IMAGE_REPAIR_TIMEOUT_MS = Number(process.env.CHESSVIEW_NEWS_IMAGE_REPAIR_TIMEOUT_MS || 12000);
const USER_AGENT = "ChessViewNewsBridge/0.1 (+https://chessview.org; image metadata repair)";
const PUBLISH_LOCK_PATH = path.join(rootDir, "Codex Tournaments", "state", "publisher.lock");
const PUBLISH_LOCK_STALE_MS = Number(process.env.CHESSVIEW_AGENT_PUBLISH_LOCK_STALE_MS || 2 * 60 * 60 * 1000);

const parseArgs = (argv) => {
  const args = {
    dryRun: true,
    domain: "all",
    inputManifest: "",
    runId: "",
    planFile: "",
    resultFile: ""
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") args.dryRun = true;
    if (arg === "--publish") args.dryRun = false;
    if (arg === "--domain") {
      args.domain = argv[index + 1] || "all";
      index += 1;
    }
    if (arg.startsWith("--domain=")) args.domain = arg.slice("--domain=".length);
    if (arg === "--input-manifest") {
      args.inputManifest = argv[index + 1] || "";
      index += 1;
    }
    if (arg.startsWith("--input-manifest=")) args.inputManifest = arg.slice("--input-manifest=".length);
    if (arg === "--run-id") {
      args.runId = argv[index + 1] || "";
      index += 1;
    }
    if (arg.startsWith("--run-id=")) args.runId = arg.slice("--run-id=".length);
    if (arg === "--plan-file") {
      args.planFile = argv[index + 1] || "";
      index += 1;
    }
    if (arg.startsWith("--plan-file=")) args.planFile = arg.slice("--plan-file=".length);
    if (arg === "--result-file") {
      args.resultFile = argv[index + 1] || "";
      index += 1;
    }
    if (arg.startsWith("--result-file=")) args.resultFile = arg.slice("--result-file=".length);
  }

  if (!["all", "news", "tournaments"].includes(args.domain)) {
    throw new Error("--domain must be one of: all, news, tournaments");
  }
  if (args.domain === "all") {
    throw new Error("--domain all is disabled; choose news or manifest-scoped tournaments explicitly");
  }
  if (args.inputManifest && args.domain !== "tournaments") {
    throw new Error("--input-manifest requires --domain tournaments");
  }
  if (args.domain === "tournaments" && !args.inputManifest) {
    throw new Error("Tournament publishing requires --input-manifest; unscoped approved-folder publishing is disabled");
  }
  if (args.domain === "tournaments" && !args.planFile) {
    throw new Error("Tournament publishing requires --plan-file for dry-run/live parity");
  }

  return args;
};

const workspaceJsonPath = (relativePath, label) => {
  const absolutePath = path.resolve(rootDir, relativePath);
  if (!isWithin(rootDir, absolutePath) || path.extname(absolutePath).toLowerCase() !== ".json") {
    throw new Error(`${label} must be a JSON file inside the backend workspace`);
  }
  return absolutePath;
};

const writeJsonAtomic = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, file);
};

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));

const isWithin = (parent, child) => {
  const relative = path.relative(parent, child);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
};

const readManifestItems = (manifestPath) => {
  const absoluteManifest = path.resolve(rootDir, manifestPath);
  if (!isWithin(rootDir, absoluteManifest)) throw new Error("Input manifest must be inside the backend workspace");
  if (!fs.existsSync(absoluteManifest)) throw new Error(`Input manifest not found: ${manifestPath}`);
  const manifest = JSON.parse(fs.readFileSync(absoluteManifest, "utf8"));
  const approvedRoot = path.resolve(rootDir, "Codex Tournaments", "approved");
  if (!Array.isArray(manifest.approvedItems)) throw new Error("Input manifest must contain approvedItems[]");
  return manifest.approvedItems.map((entry) => {
    const relativeFile = typeof entry === "string" ? entry : entry?.file;
    if (!relativeFile) throw new Error("Each manifest approvedItems entry must be a file path");
    const file = path.resolve(rootDir, relativeFile);
    if (!isWithin(approvedRoot, file) || path.extname(file).toLowerCase() !== ".json") {
      throw new Error(`Manifest item is outside Codex Tournaments/approved: ${relativeFile}`);
    }
    return { file: path.relative(rootDir, file), data: JSON.parse(fs.readFileSync(file, "utf8")) };
  });
};

const acquirePublishLock = () => {
  fs.mkdirSync(path.dirname(PUBLISH_LOCK_PATH), { recursive: true });
  try {
    const fd = fs.openSync(PUBLISH_LOCK_PATH, "wx");
    fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() }, null, 2));
    fs.closeSync(fd);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const stat = fs.statSync(PUBLISH_LOCK_PATH);
    if (Date.now() - stat.mtimeMs <= PUBLISH_LOCK_STALE_MS) {
      throw new Error(`Another publisher owns the active lock: ${path.relative(rootDir, PUBLISH_LOCK_PATH)}`);
    }
    fs.unlinkSync(PUBLISH_LOCK_PATH);
    return acquirePublishLock();
  }
  return () => {
    try {
      fs.unlinkSync(PUBLISH_LOCK_PATH);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  };
};

const listJsonFiles = (directory) => {
  if (!fs.existsSync(directory)) return [];
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listJsonFiles(fullPath);
    return entry.isFile() && entry.name.endsWith(".json") ? [fullPath] : [];
  }).sort();
};

const readApprovedItems = (relativeDirectory) => {
  const directory = path.join(rootDir, relativeDirectory);
  return listJsonFiles(directory).map((file) => ({
    file: path.relative(rootDir, file),
    data: JSON.parse(fs.readFileSync(file, "utf8"))
  }));
};

const apiRoot = () => {
  return normalizeApiRoot(process.env.CHESSVIEW_API_BASE_URL);
};

const decodeEntities = (value = "") => {
  const named = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    quot: '"'
  };

  return String(value)
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => named[name.toLowerCase()] || match);
};

const absoluteUrl = (value, baseUrl) => {
  try {
    return new URL(decodeEntities(value), baseUrl).toString();
  } catch {
    return "";
  }
};

const attrsFromTag = (tag = "") => {
  const attrs = {};
  const attrPattern = /([:@a-zA-Z0-9_-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match = attrPattern.exec(tag);
  while (match) {
    attrs[match[1].toLowerCase()] = decodeEntities(match[3] || match[4] || match[5] || "").trim();
    match = attrPattern.exec(tag);
  }
  return attrs;
};

const extractImageFromHtml = (html, baseUrl) => {
  const imageMetaNames = new Set([
    "og:image",
    "og:image:url",
    "og:image:secure_url",
    "twitter:image",
    "twitter:image:src",
    "thumbnail",
    "image"
  ]);

  for (const match of String(html || "").matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = attrsFromTag(match[0]);
    const key = (attrs.property || attrs.name || attrs.itemprop || "").toLowerCase();
    const value = attrs.content || "";
    if (imageMetaNames.has(key)) {
      const imageUrl = absoluteUrl(value, baseUrl);
      if (hasRequiredNewsImage(imageUrl)) return imageUrl;
    }
  }

  for (const match of String(html || "").matchAll(/<link\b[^>]*>/gi)) {
    const attrs = attrsFromTag(match[0]);
    const rel = String(attrs.rel || "").toLowerCase();
    const imageUrl = absoluteUrl(attrs.href || "", baseUrl);
    if ((rel.includes("image_src") || rel.includes("preload")) && hasRequiredNewsImage(imageUrl)) return imageUrl;
  }

  return "";
};

const fetchArticleImage = async (url) => {
  if (!url) return "";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMAGE_REPAIR_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": USER_AGENT
      },
      redirect: "follow",
      signal: controller.signal
    });
    if (!response.ok || !/html/i.test(response.headers.get("content-type") || "")) return "";
    const html = await response.text();
    return extractImageFromHtml(html, response.url || url);
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
};

const tournamentFamilyKey = (item) => canonicalFamilySignature(item);

const tournamentPriority = (item) => {
  const timeControl = normalizeText(item.timeControl);
  return TIME_CONTROL_PRIORITY[timeControl] || 0;
};

const gateTournamentFamilies = (items) => {
  const accepted = [];
  const rejected = [];
  const seen = new Map();

  for (const item of items) {
    const key = tournamentFamilyKey(item.data);
    if (!key || key.split("|").every((part) => !part)) {
      accepted.push(item);
      continue;
    }

    const previous = seen.get(key);
    if (previous) {
      if (tournamentPriority(item.data) > tournamentPriority(previous.data)) {
        accepted.splice(accepted.indexOf(previous), 1, item);
        seen.set(key, item);
        rejected.push({
          title: previous.data.title || previous.file,
          dedupeKey: previous.data.dedupeKey || "",
          file: previous.file,
          reasons: [
            `same tournament family as ${item.file}`,
            "lower-priority companion event held back before publishing"
          ]
        });
        continue;
      }

      rejected.push({
        title: item.data.title || item.file,
        dedupeKey: item.data.dedupeKey || "",
        file: item.file,
        reasons: [
          `same tournament family as ${previous.file}`,
          "rapid/blitz/classical companion events should be merged or linked before publishing"
        ]
      });
      continue;
    }

    seen.set(key, item);
    accepted.push(item);
  }

  return { accepted, rejected };
};

const gateSyntheticTournaments = (items) => {
  const accepted = [];
  const rejected = [];

  for (const item of items) {
    if (isSyntheticTestEvent(item.data)) {
      rejected.push({
        title: item.data?.title || item.file,
        dedupeKey: item.data?.dedupeKey || "",
        file: item.file,
        reasons: ["synthetic/local test fixture must not be published"]
      });
      continue;
    }

    accepted.push(item);
  }

  return { accepted, rejected };
};

const emptyPublishResult = (dryRun) => ({
  success: true,
  dryRun,
  created: [],
  updated: [],
  merged: [],
  skipped: [],
  rejected: [],
  errors: [],
  meta: { created: 0, updated: 0, merged: 0, skipped: 0, rejected: 0, errors: 0 }
});

const requestSizeBytes = ({ dryRun, runId, items }) =>
  Buffer.byteLength(JSON.stringify({ dryRun, runId, items }));

const splitIntoRequestBatches = ({ dryRun, runId, items }) => {
  const batches = [];
  let current = [];

  for (const item of items) {
    const candidate = current.concat(item);
    if (current.length > 0 && requestSizeBytes({ dryRun, runId, items: candidate.map((entry) => entry.data) }) > MAX_AGENT_INGEST_BATCH_BYTES) {
      batches.push(current);
      current = [item];
      continue;
    }

    current = candidate;
  }

  if (current.length > 0) batches.push(current);
  return batches;
};

const combinePublishResults = (dryRun, results) => {
  const combined = emptyPublishResult(dryRun);
  for (const result of results) {
    for (const key of ["created", "updated", "merged", "skipped", "rejected", "errors"]) {
      combined[key].push(...(result[key] || []));
    }
  }
  combined.success = combined.errors.length === 0;
  combined.meta = {
    created: combined.created.length,
    updated: combined.updated.length,
    merged: combined.merged.length,
    skipped: combined.skipped.length,
    rejected: combined.rejected.length,
    errors: combined.errors.length
  };
  return combined;
};

const publishRequest = async ({ endpoint, token, dryRun, runId, items }) => {
  const response = await fetch(`${apiRoot()}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Agent-Publish-Token": token
    },
    body: JSON.stringify({ dryRun, runId, items })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${endpoint} failed with ${response.status}: ${body.message || response.statusText}`);
  }
  return body;
};

const publishBatch = async ({ endpoint, token, dryRun, runId, items }) => {
  if (items.length === 0) return emptyPublishResult(dryRun);

  const batches = splitIntoRequestBatches({ dryRun, runId, items });
  if (batches.length > 1) {
    console.log(
      `Splitting ${endpoint} ingest into ${batches.length} batches; max request bytes=${MAX_AGENT_INGEST_BATCH_BYTES}`
    );
  }

  const results = [];
  for (let index = 0; index < batches.length; index += 1) {
    const batch = batches[index];
    results.push(
      await publishRequest({
        endpoint,
        token,
        dryRun,
        runId: batches.length > 1 ? `${runId}-batch-${index + 1}` : runId,
        items: batch.map((item) => item.data)
      })
    );
  }

  return combinePublishResults(dryRun, results);
};

const summarize = (label, result) => {
  const meta = result.meta || {};
  console.log(
    `${label}: created=${meta.created || 0} updated=${meta.updated || 0} merged=${meta.merged || 0} skipped=${meta.skipped || 0} rejected=${meta.rejected || 0} errors=${meta.errors || 0}`
  );
  if (Array.isArray(result.rejected) && result.rejected.length) {
    for (const rejected of result.rejected) {
      console.log(`  rejected: ${rejected.title || rejected.dedupeKey || "item"} - ${(rejected.reasons || []).join("; ")}`);
    }
  }
  if (Array.isArray(result.errors) && result.errors.length) {
    for (const error of result.errors) {
      console.log(`  error: ${error.title || "item"} - ${error.message}`);
    }
  }
};

const summarizeLocalRejected = (label, rejected) => {
  if (!rejected.length) return;
  console.log(`${label}: locally_rejected=${rejected.length}`);
  for (const item of rejected) {
    console.log(`  rejected: ${item.title || item.dedupeKey || "item"} - ${(item.reasons || []).join("; ")}`);
  }
};

const gateNewsImages = async (items) => {
  const accepted = [];
  const rejected = [];
  const repaired = [];
  const imageCache = new Map();

  for (const item of items) {
    if (hasRequiredNewsImage(item.data?.imageUrl)) {
      accepted.push(item);
      continue;
    }

    const articleUrl = item.data?.canonicalUrl || item.data?.sourceUrl || item.data?.url || "";
    if (articleUrl) {
      if (!imageCache.has(articleUrl)) imageCache.set(articleUrl, await fetchArticleImage(articleUrl));
      const repairedImageUrl = imageCache.get(articleUrl);
      if (hasRequiredNewsImage(repairedImageUrl)) {
        accepted.push({
          ...item,
          data: {
            ...item.data,
            imageUrl: repairedImageUrl,
            sourceLastCheckedAt: new Date().toISOString()
          }
        });
        repaired.push({ title: item.data?.title || item.file, file: item.file, imageUrl: repairedImageUrl });
        continue;
      }
    }

    rejected.push({
      title: item.data?.title || item.file,
      dedupeKey: item.data?.dedupeKey || "",
      file: item.file,
      reasons: [REQUIRED_NEWS_IMAGE_REASON]
    });
  }

  return { accepted, rejected, repaired };
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const token = process.env.AGENT_PUBLISH_TOKEN || process.env.CHESSVIEW_AGENT_PUBLISH_TOKEN;
  if (!token) throw new Error("Missing AGENT_PUBLISH_TOKEN or CHESSVIEW_AGENT_PUBLISH_TOKEN");

  const runId = args.runId || `local-agent-publish-${new Date().toISOString()}`;
  const shouldPublishTournaments = args.domain === "all" || args.domain === "tournaments";
  const shouldPublishNews = args.domain === "all" || args.domain === "news";

  const tournamentFiles = shouldPublishTournaments
    ? (args.inputManifest ? readManifestItems(args.inputManifest) : readApprovedItems("Codex Tournaments/approved"))
    : [];
  const tournamentSyntheticGate = gateSyntheticTournaments(tournamentFiles);
  const tournamentGate = gateTournamentFamilies(tournamentSyntheticGate.accepted);
  const tournaments = tournamentGate.accepted;
  const tournamentRejected = tournamentSyntheticGate.rejected.concat(tournamentGate.rejected);
  const newsFiles = shouldPublishNews ? readApprovedItems("Codex News/approved") : [];
  const newsGate = await gateNewsImages(newsFiles);
  const news = newsGate.accepted;

  let verifiedTournamentPlan = null;
  if (shouldPublishTournaments && !args.dryRun) {
    const planPath = workspaceJsonPath(args.planFile, "--plan-file");
    if (!fs.existsSync(planPath)) throw new Error(`Dry-run plan not found: ${args.planFile}`);
    const expectedPlan = readJson(planPath);
    const preflightResult = await publishBatch({
      endpoint: "/agent-ingest/tournaments",
      token,
      dryRun: true,
      runId: `${runId}-parity-check`,
      items: tournaments
    });
    verifiedTournamentPlan = createPublishPlan({
      manifestPath: args.inputManifest,
      items: tournaments,
      result: preflightResult
    });
    if (expectedPlan.planHash !== verifiedTournamentPlan.planHash || expectedPlan.inputHash !== verifiedTournamentPlan.inputHash) {
      throw new Error("Tournament publish plan changed after dry-run; live publish aborted. Run a new dry-run and review the new plan.");
    }
  }

  console.log(`ChessView agent publisher (${args.dryRun ? "dry-run" : "publish"})`);
  console.log(
    `Loaded approved JSON: tournaments=${tournamentFiles.length} news=${newsFiles.length}; publishable after local gates: tournaments=${tournaments.length} news=${news.length}`
  );
  summarizeLocalRejected("tournaments", tournamentRejected);
  summarizeLocalRejected("news", newsGate.rejected);
  if (newsGate.repaired.length) console.log(`news: repaired_images=${newsGate.repaired.length}`);

  const results = [];
  if (shouldPublishTournaments) {
    results.push([
      "tournaments",
      await publishBatch({
        endpoint: "/agent-ingest/tournaments",
        token,
        dryRun: args.dryRun,
        runId,
        items: tournaments
      })
    ]);
  }
  if (shouldPublishNews) {
    results.push([
      "news",
      await publishBatch({
        endpoint: "/agent-ingest/news",
        token,
        dryRun: args.dryRun,
        runId,
        items: news
      })
    ]);
  }

  for (const [label, result] of results) summarize(label, result);

  const tournamentResult = results.find(([label]) => label === "tournaments")?.[1];
  if (shouldPublishTournaments && args.dryRun && tournamentResult) {
    const plan = createPublishPlan({ manifestPath: args.inputManifest, items: tournaments, result: tournamentResult });
    writeJsonAtomic(workspaceJsonPath(args.planFile, "--plan-file"), {
      ...plan,
      generatedAt: new Date().toISOString(),
      runId
    });
    verifiedTournamentPlan = plan;
  }
  if (args.resultFile) {
    const resultPath = workspaceJsonPath(args.resultFile, "--result-file");
    const previous = fs.existsSync(resultPath) ? readJson(resultPath) : { schemaVersion: 1, runs: {} };
    previous.schemaVersion = 1;
    previous.manifestPath = args.inputManifest || null;
    previous.planHash = verifiedTournamentPlan?.planHash || null;
    previous.updatedAt = new Date().toISOString();
    previous.runs ||= {};
    previous.runs[args.dryRun ? "dryRun" : "publish"] = Object.fromEntries(results);
    writeJsonAtomic(resultPath, previous);
  }

  const hasBlockingErrors = results.some(([, result]) => result.errors?.length);
  if (hasBlockingErrors) process.exitCode = 1;
};

const runWithLock = async () => {
  const release = acquirePublishLock();
  try {
    await main();
  } finally {
    release();
  }
};

runWithLock().catch((error) => {
  console.error(`Publish failed: ${error.message}`);
  process.exit(1);
});
