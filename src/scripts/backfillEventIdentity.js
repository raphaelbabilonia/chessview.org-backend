require("dotenv").config({ path: ".env.local", quiet: true });
require("dotenv").config({ quiet: true });

const mongoose = require("mongoose");
const Event = require("../models/Event");
const { canonicalFamilyKey, normalizeUrl, tournamentSourceKeys } = require("../utils/tournamentIdentity");

const args = new Set(process.argv.slice(2));
const shouldApply = args.has("--apply");
const shouldCreateIndexes = args.has("--create-indexes");

const eventAsCandidate = (event) => ({
  title: event.title,
  startDate: event.startDate,
  endDate: event.endDate,
  country: event.country || event.location?.country,
  city: event.city || event.location?.city,
  venue: event.venueName,
  sourceName: event.source?.name,
  sourceUrl: event.source?.url,
  originalId: event.source?.originalId,
  sourceKeys: event.sourceKeys
});

const collisionsFor = (records, keyName) => {
  const owners = new Map();
  for (const record of records) {
    const values = Array.isArray(record[keyName]) ? record[keyName] : [record[keyName]];
    for (const value of values.filter(Boolean)) {
      const ids = owners.get(value) || [];
      ids.push(String(record._id));
      owners.set(value, ids);
    }
  }
  return [...owners.entries()].filter(([, ids]) => ids.length > 1);
};

const main = async () => {
  if (!process.env.MONGO_URI) throw new Error("Missing MONGO_URI");
  if (shouldCreateIndexes && !shouldApply) throw new Error("--create-indexes requires --apply");
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000, autoIndex: false });

  const events = await Event.find({}).lean();
  const identities = events.map((event) => {
    const candidate = eventAsCandidate(event);
    return {
      _id: event._id,
      canonicalFamilyKey: canonicalFamilyKey(candidate),
      sourceKeys: tournamentSourceKeys(candidate),
      sourceRefs: event.sourceRefs?.length
        ? event.sourceRefs
        : candidate.sourceKeys?.length
          ? [{
              sourceKey: candidate.sourceKeys[0],
              name: candidate.sourceName || "",
              url: normalizeUrl(candidate.sourceUrl),
              originalId: candidate.originalId || "",
              lastCheckedAt: event.source?.lastCheckedAt || null,
              contentHash: ""
            }]
          : []
    };
  });
  const sourceCollisions = collisionsFor(identities, "sourceKeys");
  const familyCollisions = collisionsFor(identities, "canonicalFamilyKey");
  console.log(JSON.stringify({
    mode: shouldApply ? "apply" : "audit",
    events: events.length,
    sourceKeyCollisions: sourceCollisions.length,
    familyKeyCollisions: familyCollisions.length,
    sourceCollisionSamples: sourceCollisions.slice(0, 20),
    familyCollisionSamples: familyCollisions.slice(0, 20)
  }, null, 2));

  if (shouldApply) {
    const operations = identities.map((identity) => ({
      updateOne: {
        filter: { _id: identity._id },
        update: { $set: {
          canonicalFamilyKey: identity.canonicalFamilyKey || undefined,
          sourceKeys: identity.sourceKeys.length ? identity.sourceKeys : undefined,
          sourceRefs: identity.sourceRefs.length ? identity.sourceRefs : undefined
        } }
      }
    }));
    if (operations.length) await Event.bulkWrite(operations, { ordered: false });
    console.log(`Backfilled identity fields for ${operations.length} events.`);
  }

  if (shouldCreateIndexes) {
    if (sourceCollisions.length || familyCollisions.length) {
      throw new Error("Unique indexes were not created because identity collisions require review");
    }
    const indexes = await Event.collection.indexes();
    for (const index of indexes) {
      const isSourceKeysIndex = JSON.stringify(index.key) === JSON.stringify({ sourceKeys: 1 });
      const isFamilyIndex = JSON.stringify(index.key) === JSON.stringify({ canonicalFamilyKey: 1 });
      if ((isSourceKeysIndex || isFamilyIndex) && !index.unique) await Event.collection.dropIndex(index.name);
    }
    await Event.collection.createIndex(
      { sourceKeys: 1 },
      { unique: true, partialFilterExpression: { sourceKeys: { $exists: true } }, name: "unique_event_source_keys" }
    );
    await Event.collection.createIndex(
      { canonicalFamilyKey: 1 },
      { unique: true, partialFilterExpression: { canonicalFamilyKey: { $type: "string" } }, name: "unique_event_family" }
    );
    console.log("Created unique event source and family identity indexes.");
  }
};

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  });
