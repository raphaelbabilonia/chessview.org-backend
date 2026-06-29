require("dotenv").config();
const mongoose = require("mongoose");
const { connectDB } = require("../config/db");
const Event = require("../models/Event");
const { inferRatingType, inferTimeControl } = require("../scrapers/tournamentUtils");

const hasFlag = (name) => process.argv.includes(`--${name}`);

const metadataText = (event) =>
  [event.title, event.description, event.timeControl, event.ratingType, event.source?.name]
    .filter(Boolean)
    .join(" ");

const inferPatch = (event) => {
  const text = metadataText(event);
  const patch = {};

  if (!event.timeControl) {
    const timeControl = inferTimeControl(text);
    if (timeControl) patch.timeControl = timeControl;
  }

  if (!event.ratingType) {
    const ratingType = inferRatingType(text);
    if (ratingType) patch.ratingType = ratingType;
  }

  return patch;
};

const main = async () => {
  await connectDB();

  const apply = hasFlag("apply");
  const events = await Event.find({
    $or: [{ timeControl: { $in: ["", null] } }, { ratingType: { $in: ["", null] } }]
  }).sort({ startDate: 1, title: 1 });

  const updates = [];
  for (const event of events) {
    const patch = inferPatch(event);
    if (!Object.keys(patch).length) continue;

    updates.push({
      id: String(event._id),
      title: event.title,
      sourceName: event.source?.name || "",
      patch
    });

    if (apply) {
      Object.assign(event, patch);
      await event.save();
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: apply ? "apply" : "dry-run",
        scanned: events.length,
        updated: updates.length,
        updates: updates.slice(0, 50)
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
