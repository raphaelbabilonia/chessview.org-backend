require("dotenv").config({ path: ".env.local", quiet: true });
require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "../..");

const parseArgs = (argv) => {
  const args = {
    dryRun: true,
    domain: "all"
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
  }

  if (!["all", "news", "tournaments"].includes(args.domain)) {
    throw new Error("--domain must be one of: all, news, tournaments");
  }

  return args;
};

const listJsonFiles = (directory) => {
  if (!fs.existsSync(directory)) return [];
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listJsonFiles(fullPath);
    return entry.isFile() && entry.name.endsWith(".json") ? [fullPath] : [];
  });
};

const readApprovedItems = (relativeDirectory) => {
  const directory = path.join(rootDir, relativeDirectory);
  return listJsonFiles(directory).map((file) => ({
    file: path.relative(rootDir, file),
    data: JSON.parse(fs.readFileSync(file, "utf8"))
  }));
};

const apiRoot = () => {
  const base = process.env.CHESSVIEW_API_BASE_URL;
  if (!base) throw new Error("Missing CHESSVIEW_API_BASE_URL");
  return base.replace(/\/+$/, "");
};

const publishBatch = async ({ endpoint, token, dryRun, runId, items }) => {
  if (items.length === 0) {
    return {
      success: true,
      dryRun,
      created: [],
      updated: [],
      skipped: [],
      rejected: [],
      errors: [],
      meta: { created: 0, updated: 0, skipped: 0, rejected: 0, errors: 0 }
    };
  }

  const response = await fetch(`${apiRoot()}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Agent-Publish-Token": token
    },
    body: JSON.stringify({ dryRun, runId, items: items.map((item) => item.data) })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${endpoint} failed with ${response.status}: ${body.message || response.statusText}`);
  }
  return body;
};

const summarize = (label, result) => {
  const meta = result.meta || {};
  console.log(
    `${label}: created=${meta.created || 0} updated=${meta.updated || 0} skipped=${meta.skipped || 0} rejected=${meta.rejected || 0} errors=${meta.errors || 0}`
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

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const token = process.env.CHESSVIEW_AGENT_PUBLISH_TOKEN;
  if (!token) throw new Error("Missing CHESSVIEW_AGENT_PUBLISH_TOKEN");

  const runId = `local-agent-publish-${new Date().toISOString()}`;
  const shouldPublishTournaments = args.domain === "all" || args.domain === "tournaments";
  const shouldPublishNews = args.domain === "all" || args.domain === "news";

  const tournaments = shouldPublishTournaments ? readApprovedItems("Codex Tournaments/approved") : [];
  const news = shouldPublishNews ? readApprovedItems("Codex News/approved") : [];

  console.log(`ChessView agent publisher (${args.dryRun ? "dry-run" : "publish"})`);
  console.log(`Loaded approved JSON: tournaments=${tournaments.length} news=${news.length}`);

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

  const hasBlockingErrors = results.some(([, result]) => result.errors?.length);
  if (hasBlockingErrors) process.exitCode = 1;
};

main().catch((error) => {
  console.error(`Publish failed: ${error.message}`);
  process.exit(1);
});
