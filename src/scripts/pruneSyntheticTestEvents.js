require("dotenv").config({ path: ".env.local", quiet: true });
require("dotenv").config({ quiet: true });

const mongoose = require("mongoose");
const { connectDB } = require("../config/db");
const Event = require("../models/Event");
const EventDocument = require("../models/EventDocument");
const Pairing = require("../models/Pairing");
const Player = require("../models/Player");
const Registration = require("../models/Registration");
const Round = require("../models/Round");
const Section = require("../models/Section");
const { syntheticTestEventQuery } = require("../utils/syntheticTestEvents");

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

  const matches = await Event.find(syntheticTestEventQuery())
    .select("title slug dedupeKey source websiteUrl isPublic status")
    .sort({ startDate: 1, createdAt: 1 })
    .lean();

  console.log(`Synthetic event cleanup (${args.mode})`);
  console.log(`Found ${matches.length} synthetic local-density event(s).`);
  for (const event of matches.slice(0, 20)) {
    console.log(`  ${event.title || event.slug || event._id} [${event.dedupeKey || event.source?.originalId || "no key"}]`);
  }
  if (matches.length > 20) console.log(`  ...and ${matches.length - 20} more`);

  if (args.dryRun || matches.length === 0) return;

  const ids = matches.map((event) => event._id);

  if (args.mode === "quarantine") {
    const result = await Event.updateMany(
      { _id: { $in: ids } },
      {
        $set: {
          isPublic: false,
          status: "draft"
        }
      }
    );
    console.log(`Quarantined ${result.modifiedCount || 0} synthetic event(s).`);
    return;
  }

  if (args.mode === "delete") {
    const [sections, registrations, players, rounds, pairings, documents, events] = await Promise.all([
      Section.deleteMany({ event: { $in: ids } }),
      Registration.deleteMany({ event: { $in: ids } }),
      Player.deleteMany({ event: { $in: ids } }),
      Round.deleteMany({ event: { $in: ids } }),
      Pairing.deleteMany({ event: { $in: ids } }),
      EventDocument.deleteMany({ event: { $in: ids } }),
      Event.deleteMany({ _id: { $in: ids } })
    ]);

    console.log(
      [
        `Deleted ${events.deletedCount || 0} synthetic event(s).`,
        `Cascade: ${sections.deletedCount || 0} section(s), ${registrations.deletedCount || 0} registration(s),`,
        `${players.deletedCount || 0} player(s), ${rounds.deletedCount || 0} round(s),`,
        `${pairings.deletedCount || 0} pairing(s), ${documents.deletedCount || 0} document(s).`
      ].join(" ")
    );
  }
};

main()
  .catch((error) => {
    console.error(`Synthetic event cleanup failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
