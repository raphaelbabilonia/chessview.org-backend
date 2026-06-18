require("dotenv").config({ quiet: true });
const mongoose = require("mongoose");
const { connectDB } = require("../config/db");
const seedDatabase = require("../utils/seedDatabase");

const run = async () => {
  await connectDB();
  const eventCount = await seedDatabase();
  console.log(`Seeded MongoDB with ${eventCount} events.`);
  await mongoose.disconnect();
};

run().catch((error) => {
  console.error("Seed failed:", error.message);
  process.exit(1);
});
