require("dotenv").config();
const { connectDB } = require("../config/db");
const ScrapeSource = require("../models/ScrapeSource");
const { ensureDefaultScrapeSources, runScrapeSource } = require("../services/scrapeRunner");

const readArg = (name, fallback = "") => {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);

  const index = process.argv.indexOf(`--${name}`);
  if (index !== -1) return process.argv[index + 1] || fallback;
  return fallback;
};

const hasFlag = (name) => process.argv.includes(`--${name}`);

const main = async () => {
  await connectDB();

  if (hasFlag("ensure-defaults")) {
    await ensureDefaultScrapeSources();
  }

  const includeDisabled = hasFlag("all");
  const limit = Number(readArg("limit", 2));
  const query = includeDisabled ? {} : { enabled: true };
  const sources = await ScrapeSource.find(query).sort({ enabled: -1, key: 1 });
  const results = [];

  for (const source of sources) {
    try {
      const job = await runScrapeSource(source, {
        mode: "dry-run",
        config: {
          limit
        }
      });
      results.push({
        key: source.key,
        type: source.type,
        enabled: source.enabled,
        ok: true,
        fetched: job.stats.fetched,
        skipped: job.stats.skipped,
        warnings: job.warnings
      });
    } catch (error) {
      results.push({
        key: source.key,
        type: source.type,
        enabled: source.enabled,
        ok: false,
        error: error.message
      });
    }
  }

  console.log(JSON.stringify({ ok: results.every((result) => result.ok), results }, null, 2));
};

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    setTimeout(() => process.exit(0), 50);
  });
