require("dotenv").config();
const mongoose = require("mongoose");
const { connectDB } = require("../config/db");
const { searchLichessBroadcasts } = require("../scrapers/lichessBroadcasts");
const { importTournamentMetadata } = require("../services/tournamentMetadataImporter");

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

const main = async () => {
  const query = readArg("query", "world");
  const page = Number(readArg("page", "1"));
  const limit = Number(readArg("limit", "5"));
  const shouldApply = hasFlag("apply");
  const userAgent = process.env.SCRAPER_USER_AGENT || undefined;

  const scrapeResult = await searchLichessBroadcasts({ query, page, userAgent });
  const tournaments = scrapeResult.tournaments.slice(0, Number.isFinite(limit) ? limit : 5);

  if (!shouldApply) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          mode: "dry-run",
          sourceName: scrapeResult.sourceName,
          sourceUrl: scrapeResult.sourceUrl,
          count: tournaments.length,
          tournaments
        },
        null,
        2
      )
    );
    return;
  }

  await connectDB();

  const importResult = await importTournamentMetadata(tournaments);
  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: "apply",
        sourceName: scrapeResult.sourceName,
        sourceUrl: scrapeResult.sourceUrl,
        count: tournaments.length,
        import: importResult
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
