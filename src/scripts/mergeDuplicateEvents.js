require("dotenv").config({ path: ".env.local", quiet: true });
require("dotenv").config({ quiet: true });

const fs = require("node:fs");
const path = require("node:path");
const mongoose = require("mongoose");
const { connectDB } = require("../config/db");
const Event = require("../models/Event");
const EventDocument = require("../models/EventDocument");
const Pairing = require("../models/Pairing");
const Player = require("../models/Player");
const Registration = require("../models/Registration");
const Round = require("../models/Round");
const Section = require("../models/Section");
const { datePart, tournamentSourceKeys } = require("../utils/tournamentIdentity");

// Merges only pairs a person reviewed. Dry-run unless --apply is given.
const FILLED_FIELDS = ["timeControl", "venueName", "address", "ratingType", "resultsUrl", "regulationsUrl"];
const CHILD_MODELS = { Section, Registration, Player, Round, Pairing, EventDocument };

const parseArgs = (argv) => {
  const args = { apply: false, plan: "" };
  for (const arg of argv) {
    if (arg === "--apply") args.apply = true;
    else if (arg.startsWith("--plan=")) args.plan = arg.slice("--plan=".length);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.plan) throw new Error("--plan=<file> is required");
  return args;
};

const sourceRefsOf = (event) => {
  if (event.sourceRefs?.length) return event.sourceRefs;
  const sourceKey = tournamentSourceKeys(event).find((key) => key.startsWith("source:"));
  if (!sourceKey) return [];
  return [{
    sourceKey,
    name: event.source?.name || "",
    url: event.source?.url || "",
    originalId: event.source?.originalId || "",
    lastCheckedAt: event.source?.lastCheckedAt,
    contentHash: ""
  }];
};

const mergeProblems = (keep, remove, childCounts = {}) => {
  const problems = [];
  if (!keep) problems.push("the record to keep does not exist");
  if (!remove) problems.push("the record to remove does not exist");
  if (!keep || !remove) return problems;
  if (String(keep._id) === String(remove._id)) problems.push("keep and remove are the same record");
  if (!keep.isPublic) problems.push("the record to keep is not public");
  if (datePart(keep.startDate) !== datePart(remove.startDate)) problems.push("start dates differ");
  for (const [model, count] of Object.entries(childCounts)) {
    if (count > 0) problems.push(`the record to remove has ${count} ${model} record(s)`);
  }
  return problems;
};

const mergedEventChanges = (keep, remove) => {
  const changes = {
    sourceKeys: [...new Set([...tournamentSourceKeys(keep), ...tournamentSourceKeys(remove)])].sort()
  };
  const refs = [...sourceRefsOf(keep)];
  for (const ref of sourceRefsOf(remove)) {
    if (!refs.some((existing) => existing.sourceKey === ref.sourceKey)) refs.push(ref);
  }
  changes.sourceRefs = refs;
  for (const field of FILLED_FIELDS) {
    if (!keep[field] && remove[field]) changes[field] = remove[field];
  }
  return changes;
};

const childCountsFor = async (eventId) =>
  Object.fromEntries(
    await Promise.all(Object.entries(CHILD_MODELS).map(async ([name, model]) => [name, await model.countDocuments({ event: eventId })]))
  );

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const plan = JSON.parse(fs.readFileSync(path.resolve(args.plan), "utf8"));
  if (!process.env.MONGO_URI) throw new Error("Missing MONGO_URI");
  await connectDB();

  const steps = [];
  for (const pair of plan.merges) {
    const [keep, remove] = await Promise.all([Event.findOne({ slug: pair.keep }).lean(), Event.findOne({ slug: pair.remove }).lean()]);
    if (keep && !remove) {
      console.log(`already merged: ${pair.remove}`);
      continue;
    }
    const childCounts = remove ? await childCountsFor(remove._id) : {};
    const problems = mergeProblems(keep, remove, childCounts);
    if (problems.length) throw new Error(`${pair.keep} <- ${pair.remove}: ${problems.join("; ")}`);
    steps.push({ pair, keep, remove, changes: mergedEventChanges(keep, remove) });
  }

  console.log(`Duplicate event merge (${args.apply ? "apply" : "dry-run"}): ${steps.length} pair(s)`);
  for (const { pair, changes } of steps) {
    const filled = FILLED_FIELDS.filter((field) => field in changes);
    console.log(`  keep ${pair.keep} <- remove ${pair.remove}; sourceKeys=${changes.sourceKeys.length}; filled=${filled.join(",") || "none"}`);
  }
  if (!args.apply) return;

  for (const { keep, remove, changes } of steps) {
    console.log(`BACKUP ${JSON.stringify({ keep, remove })}`);
    await Event.updateOne({ _id: keep._id }, { $set: changes });
    await Event.deleteOne({ _id: remove._id });
  }
  console.log(`Merged ${steps.length} pair(s).`);
};

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(`Duplicate event merge failed: ${error.message}`);
      process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
}

module.exports = { mergedEventChanges, mergeProblems, parseArgs };
