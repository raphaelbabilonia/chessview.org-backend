require("dotenv").config({ quiet: true });
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const User = require("../models/User");
const Event = require("../models/Event");
const Section = require("../models/Section");
const Registration = require("../models/Registration");
const Player = require("../models/Player");
const Round = require("../models/Round");
const Pairing = require("../models/Pairing");
const { seedMemoryStore } = require("../utils/memoryStore");

const seedMongo = async () => {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 3000 });
  await Promise.all([
    User.deleteMany({}),
    Event.deleteMany({}),
    Section.deleteMany({}),
    Registration.deleteMany({}),
    Player.deleteMany({}),
    Round.deleteMany({}),
    Pairing.deleteMany({})
  ]);

  const passwordHash = await bcrypt.hash("password123", 10);
  const [admin, organizer, playerUser] = await User.create([
    { name: "Chess View Admin", email: "admin@chessview.local", passwordHash, role: "admin" },
    { name: "Demo Organizer", email: "organizer@chessview.local", passwordHash, role: "organizer" },
    { name: "Luca Player", email: "player@chessview.local", passwordHash, role: "player" }
  ]);

  const [openCuneo, juniorRapid, familyFestival] = await Event.create([
    {
      title: "Chess View Open Cuneo",
      slug: "chess-view-open-cuneo",
      description: "A weekend classical tournament for club players and ambitious juniors.",
      organizer: organizer._id,
      city: "Cuneo",
      venueName: "Academy Hall",
      address: "Via Demo 12, Cuneo",
      startDate: new Date("2026-07-11T08:30:00.000Z"),
      endDate: new Date("2026-07-12T18:00:00.000Z"),
      status: "published",
      registrationStatus: "open",
      timeControl: "60 min + 30 sec",
      maxPlayers: 80,
      contactEmail: "organizer@chessview.local",
      isPublic: true
    },
    {
      title: "Junior Rapid Challenge",
      slug: "junior-rapid-challenge",
      description: "A draft junior event with multiple age sections ready for organizer setup.",
      organizer: organizer._id,
      city: "Torino",
      venueName: "Youth Chess Room",
      address: "Corso Demo 4, Torino",
      startDate: new Date("2026-08-22T08:00:00.000Z"),
      endDate: new Date("2026-08-22T16:30:00.000Z"),
      status: "draft",
      registrationStatus: "closed",
      timeControl: "15 min + 10 sec",
      maxPlayers: 60,
      contactEmail: "organizer@chessview.local",
      isPublic: false
    },
    {
      title: "Sunday Family Chess Festival",
      slug: "sunday-family-chess-festival",
      description: "A completed rapid event used for standings, results, and public pairings demos.",
      organizer: organizer._id,
      city: "Alba",
      venueName: "Community Center",
      address: "Piazza Demo 8, Alba",
      startDate: new Date("2026-05-17T08:30:00.000Z"),
      endDate: new Date("2026-05-17T17:00:00.000Z"),
      status: "completed",
      registrationStatus: "closed",
      timeControl: "12 min + 3 sec",
      maxPlayers: 32,
      contactEmail: "organizer@chessview.local",
      isPublic: true
    }
  ]);

  const [openSection, under10, under16, festivalOpen] = await Section.create([
    { event: openCuneo._id, name: "Open", maxPlayers: 80, timeControl: "60 min + 30 sec", roundsCount: 5 },
    { event: openCuneo._id, name: "Under 10", maxPlayers: 24, birthYearMin: 2016, timeControl: "25 min + 10 sec", roundsCount: 5 },
    { event: juniorRapid._id, name: "Under 16", maxPlayers: 36, birthYearMin: 2010, timeControl: "15 min + 10 sec", roundsCount: 6 },
    { event: familyFestival._id, name: "Open", maxPlayers: 32, timeControl: "12 min + 3 sec", roundsCount: 3 }
  ]);

  await Registration.create([
    {
      event: openCuneo._id,
      section: openSection._id,
      user: playerUser._id,
      firstName: "Luca",
      lastName: "Bianchi",
      email: "player@chessview.local",
      club: "Cuneo Academy",
      rating: 1420,
      birthYear: 2009,
      status: "pending"
    }
  ]);

  const players = await Player.create([
    { event: openCuneo._id, section: openSection._id, firstName: "Ada", lastName: "Ferrero", rating: 1810, club: "Cuneo Academy", email: "ada@example.local" },
    { event: openCuneo._id, section: openSection._id, firstName: "Bruno", lastName: "Costa", rating: 1690, club: "Torino Chess", email: "bruno@example.local" },
    { event: familyFestival._id, section: festivalOpen._id, firstName: "Nora", lastName: "Gallo", rating: 1720, club: "Alba Scacchi", email: "nora@example.local" },
    { event: familyFestival._id, section: festivalOpen._id, firstName: "Paolo", lastName: "Riva", rating: 1650, club: "Cuneo Academy", email: "paolo@example.local" },
    { event: familyFestival._id, section: festivalOpen._id, firstName: "Sara", lastName: "Marino", rating: 1510, club: "Junior Club", email: "sara@example.local" },
    { event: familyFestival._id, section: festivalOpen._id, firstName: "Tommaso", lastName: "Leone", rating: 1390, club: "Alba Scacchi", email: "tommaso@example.local" }
  ]);

  const [round1, round2, round3] = await Round.create([
    { event: familyFestival._id, section: festivalOpen._id, number: 1, name: "Round 1", status: "completed", startsAt: new Date("2026-05-17T09:00:00.000Z") },
    { event: familyFestival._id, section: festivalOpen._id, number: 2, name: "Round 2", status: "completed", startsAt: new Date("2026-05-17T11:00:00.000Z") },
    { event: familyFestival._id, section: festivalOpen._id, number: 3, name: "Round 3", status: "completed", startsAt: new Date("2026-05-17T14:00:00.000Z") }
  ]);

  const [ada, bruno, nora, paolo, sara, tommaso] = players;
  await Round.create({ event: openCuneo._id, section: openSection._id, number: 1, name: "Round 1", status: "published", startsAt: new Date("2026-07-11T09:00:00.000Z") });
  await Pairing.create([
    { event: familyFestival._id, section: festivalOpen._id, round: round1._id, boardNumber: 1, whitePlayer: nora._id, blackPlayer: tommaso._id, result: "1-0" },
    { event: familyFestival._id, section: festivalOpen._id, round: round1._id, boardNumber: 2, whitePlayer: paolo._id, blackPlayer: sara._id, result: "1/2-1/2" },
    { event: familyFestival._id, section: festivalOpen._id, round: round2._id, boardNumber: 1, whitePlayer: sara._id, blackPlayer: nora._id, result: "0-1" },
    { event: familyFestival._id, section: festivalOpen._id, round: round2._id, boardNumber: 2, whitePlayer: tommaso._id, blackPlayer: paolo._id, result: "0-1" },
    { event: familyFestival._id, section: festivalOpen._id, round: round3._id, boardNumber: 1, whitePlayer: nora._id, blackPlayer: paolo._id, result: "1/2-1/2" },
    { event: familyFestival._id, section: festivalOpen._id, round: round3._id, boardNumber: 2, whitePlayer: sara._id, blackPlayer: tommaso._id, result: "1-0" }
  ]);

  console.log(`Seeded MongoDB with ${await Event.countDocuments()} events.`);
  await mongoose.disconnect();
};

const run = async () => {
  try {
    if (process.env.MEMORY_STORE === "true" || !process.env.MONGO_URI) {
      await seedMemoryStore({ force: true });
      console.log("Seeded in-memory demo data. It will be available when the server starts in memory mode.");
      return;
    }
    await seedMongo();
  } catch (error) {
    console.warn("MongoDB seed unavailable, seeding memory store instead.");
    console.warn(error.message);
    await seedMemoryStore({ force: true });
    console.log("Seeded in-memory demo data.");
  }
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
