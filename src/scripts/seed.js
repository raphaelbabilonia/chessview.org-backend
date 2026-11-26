require("dotenv").config({ quiet: true });
const mongoose = require("mongoose");
const { connectDB } = require("../config/db");
const seedDatabase = require("../utils/seedDatabase");
const Event = require("../models/Event");

// Seeding erases every collection first. It is for a local or disposable database only.
const SEED_SAFE_EVENT_COUNT = 100;

const run = async () => {
  if (process.env.NODE_ENV === "production") {
    throw new Error("refused: NODE_ENV is production and seeding erases every collection");
  }
  await connectDB();
  const existing = await Event.estimatedDocumentCount();
  if (existing > SEED_SAFE_EVENT_COUNT && !process.argv.includes("--erase-existing-data")) {
    await mongoose.disconnect();
    throw new Error(`refused: this database holds ${existing} events; pass --erase-existing-data to wipe it`);
  }
  const eventCount = await seedDatabase();
  console.log(`Seeded MongoDB with ${eventCount} events.`);
  await mongoose.disconnect();
};

run().catch((error) => {
  console.error("Seed failed:", error.message);
  process.exit(1);
});
