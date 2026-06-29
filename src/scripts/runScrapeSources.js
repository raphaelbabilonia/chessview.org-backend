require("dotenv").config();
const mongoose = require("mongoose");
const { connectDB } = require("../config/db");
const {
  ensureDefaultScrapeSources,
  runDueScrapeSources,
  runScrapeSourceByKey
} = require("../services/scrapeRunner");

const readArg = (name, fallback) => {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);

  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith("--")) {
    return process.argv[index + 1];
  }

  return fallback;
};

const hasFlag = (name) => process.argv.includes(`--${name}`);
const mode = readArg("mode", hasFlag("apply") ? "apply" : "dry-run");

const main = async () => {
  await connectDB();

  if (hasFlag("ensure-defaults")) {
    const sources = await ensureDefaultScrapeSources();
    console.log(
      JSON.stringify(
        {
          ok: true,
          action: "ensure-defaults",
          sources: sources.map((source) => ({
            id: String(source._id),
            key: source.key,
            name: source.name,
            type: source.type,
            enabled: source.enabled
          }))
        },
        null,
        2
      )
    );
  }

  const key = readArg("source", "");
  if (key) {
    const config = {};
    const query = readArg("query", "");
    const limit = readArg("limit", "");
    const page = readArg("page", "");
    const timings = readArg("timings", "");
    if (query) config.query = query;
    if (limit) config.limit = Number(limit);
    if (page) config.page = Number(page);
    if (timings) config.timings = timings.split(",").map((timing) => timing.trim()).filter(Boolean);

    const job = await runScrapeSourceByKey(key, { mode, config });
    console.log(JSON.stringify({ ok: true, action: "run-source", job }, null, 2));
    return;
  }

  if (hasFlag("run-due")) {
    const jobs = await runDueScrapeSources({
      mode,
      limit: Number(readArg("limit", "5"))
    });
    console.log(JSON.stringify({ ok: true, action: "run-due", jobs }, null, 2));
  }
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
