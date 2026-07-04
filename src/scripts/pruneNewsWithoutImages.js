require("dotenv").config({ path: ".env.local", quiet: true });
require("dotenv").config({ quiet: true });

const mongoose = require("mongoose");
const { connectDB } = require("../config/db");
const NewsItem = require("../models/NewsItem");
const { REQUIRED_NEWS_IMAGE_FLAG, missingRequiredNewsImageQuery } = require("../utils/newsImagePolicy");

const parseArgs = (argv) => {
  const args = {
    dryRun: true,
    mode: "dry-run"
  };

  for (const arg of argv) {
    if (arg === "--delete") {
      args.dryRun = false;
      args.mode = "delete";
    } else if (arg === "--quarantine") {
      args.dryRun = false;
      args.mode = "quarantine";
    } else if (arg === "--dry-run") {
      args.dryRun = true;
      args.mode = "dry-run";
    }
  }

  return args;
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (!process.env.MONGO_URI) throw new Error("Missing MONGO_URI");

  await connectDB();

  const matches = await NewsItem.find(missingRequiredNewsImageQuery)
    .select("title sourceName sourceUrl canonicalUrl imageUrl publishStatus isPublic")
    .sort({ publishedAt: -1, createdAt: -1 })
    .lean();

  console.log(`News image cleanup (${args.mode})`);
  console.log(`Found ${matches.length} news item(s) without a required publisher image.`);
  for (const item of matches.slice(0, 20)) {
    console.log(`  ${item.title || item.sourceUrl || item.canonicalUrl || item._id} [${item.sourceName || "unknown source"}]`);
  }
  if (matches.length > 20) console.log(`  ...and ${matches.length - 20} more`);

  if (args.dryRun || matches.length === 0) return;

  if (args.mode === "delete") {
    const result = await NewsItem.deleteMany(missingRequiredNewsImageQuery);
    console.log(`Deleted ${result.deletedCount || 0} news item(s) without publisher images.`);
    return;
  }

  if (args.mode === "quarantine") {
    const result = await NewsItem.updateMany(missingRequiredNewsImageQuery, {
      $set: {
        isPublic: false,
        publishStatus: "quarantined"
      },
      $addToSet: {
        qualityFlags: REQUIRED_NEWS_IMAGE_FLAG
      }
    });
    console.log(`Quarantined ${result.modifiedCount || 0} news item(s) without publisher images.`);
  }
};

main()
  .catch((error) => {
    console.error(`News image cleanup failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
