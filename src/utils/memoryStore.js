const bcrypt = require("bcryptjs");
const calculateStandings = require("./calculateStandings");

const store = {
  users: [],
  events: [],
  sections: [],
  registrations: [],
  players: [],
  rounds: [],
  pairings: [],
  devices: [],
  broadcastSessions: [],
  frames: [],
  seeded: false
};

let counter = 1;

const makeId = () => {
  const suffix = String(counter++).padStart(6, "0");
  return `000000000000000000${suffix}`.slice(-24);
};

const clone = (value) => JSON.parse(JSON.stringify(value));

const publicUser = (user) => {
  if (!user) return null;
  const { passwordHash, ...safeUser } = user;
  return clone(safeUser);
};

const byId = (collection, id) => collection.find((item) => String(item._id) === String(id));

const byEventOrSlug = (id) => {
  return store.events.find((event) => String(event._id) === String(id) || event.slug === id);
};

const slugify = (value) => {
  return String(value || "event")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
};

const now = () => new Date().toISOString();

const createRecord = (collection, data) => {
  const record = {
    _id: makeId(),
    createdAt: now(),
    updatedAt: now(),
    ...data
  };
  collection.push(record);
  return record;
};

const updateRecord = (record, data) => {
  Object.assign(record, data, { updatedAt: now() });
  return record;
};

const resetStore = () => {
  store.users = [];
  store.events = [];
  store.sections = [];
  store.registrations = [];
  store.players = [];
  store.rounds = [];
  store.pairings = [];
  store.devices = [];
  store.broadcastSessions = [];
  store.frames = [];
  store.seeded = false;
  counter = 1;
};

const createUser = async ({ name, email, password, role }) => {
  const passwordHash = await bcrypt.hash(password, 10);
  return createRecord(store.users, {
    name,
    email: email.toLowerCase(),
    passwordHash,
    role
  });
};

const createEvent = (organizer, data) => {
  const slugBase = slugify(data.title);
  const sameSlugCount = store.events.filter((event) => event.slug.startsWith(slugBase)).length;
  return createRecord(store.events, {
    title: data.title,
    slug: sameSlugCount ? `${slugBase}-${sameSlugCount + 1}` : slugBase,
    description: data.description || "",
    organizer: organizer._id || organizer,
    city: data.city,
    venueName: data.venueName || "",
    address: data.address || "",
    startDate: data.startDate,
    endDate: data.endDate,
    status: data.status || "draft",
    registrationStatus: data.registrationStatus || "closed",
    timeControl: data.timeControl || "",
    maxPlayers: data.maxPlayers || 0,
    contactEmail: data.contactEmail || "",
    websiteUrl: data.websiteUrl || "",
    regulationsUrl: data.regulationsUrl || "",
    isPublic: Boolean(data.isPublic)
  });
};

const createSection = (event, data) => {
  return createRecord(store.sections, {
    event: event._id || event,
    name: data.name,
    description: data.description || "",
    maxPlayers: data.maxPlayers || 0,
    ratingMin: data.ratingMin || null,
    ratingMax: data.ratingMax || null,
    birthYearMin: data.birthYearMin || null,
    birthYearMax: data.birthYearMax || null,
    timeControl: data.timeControl || "",
    roundsCount: data.roundsCount || 5
  });
};

const createPlayer = (event, section, data) => {
  return createRecord(store.players, {
    event: event._id || event,
    section: section._id || section,
    user: data.user || null,
    firstName: data.firstName,
    lastName: data.lastName,
    federation: data.federation || "ITA",
    club: data.club || "",
    rating: Number(data.rating || 0),
    birthYear: data.birthYear || null,
    email: data.email || "",
    status: data.status || "active"
  });
};

const createRound = (event, section, data) => {
  return createRecord(store.rounds, {
    event: event._id || event,
    section: section._id || section,
    number: Number(data.number),
    name: data.name || `Round ${data.number}`,
    status: data.status || "draft",
    startsAt: data.startsAt || null
  });
};

const createPairing = (event, section, round, data) => {
  return createRecord(store.pairings, {
    event: event._id || event,
    section: section._id || section,
    round: round._id || round,
    boardNumber: Number(data.boardNumber),
    whitePlayer: data.whitePlayer,
    blackPlayer: data.blackPlayer || null,
    result: data.result || "pending",
    notes: data.notes || ""
  });
};

const createRegistration = (event, section, user, data) => {
  return createRecord(store.registrations, {
    event: event._id || event,
    section: section._id || section,
    user: user._id || user,
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email.toLowerCase(),
    club: data.club || "",
    rating: Number(data.rating || 0),
    birthYear: data.birthYear || null,
    status: data.status || "pending"
  });
};

const getEventBundle = (event) => {
  const sections = store.sections.filter((section) => section.event === event._id);
  const players = store.players.filter((player) => player.event === event._id);
  const rounds = store.rounds.filter((round) => round.event === event._id);
  const pairings = store.pairings.filter((pairing) => pairing.event === event._id);
  const registrations = store.registrations.filter((registration) => registration.event === event._id);
  const standings = calculateStandings(players, pairings);

  return {
    ...clone(event),
    organizer: publicUser(byId(store.users, event.organizer)),
    sections: clone(sections),
    players: clone(players),
    rounds: clone(rounds),
    pairings: clone(pairings),
    registrations: clone(registrations),
    standings
  };
};

const summarizeEvent = (event) => {
  return {
    ...clone(event),
    organizer: publicUser(byId(store.users, event.organizer)),
    sectionsCount: store.sections.filter((section) => section.event === event._id).length,
    playersCount: store.players.filter((player) => player.event === event._id).length,
    roundsCount: store.rounds.filter((round) => round.event === event._id).length
  };
};

const seedMemoryStore = async ({ force = false } = {}) => {
  if (store.seeded && !force) return store;
  resetStore();

  const admin = await createUser({
    name: "Chess View Admin",
    email: "admin@chessview.local",
    password: "password123",
    role: "admin"
  });
  const organizer = await createUser({
    name: "Demo Organizer",
    email: "organizer@chessview.local",
    password: "password123",
    role: "organizer"
  });
  const player = await createUser({
    name: "Luca Player",
    email: "player@chessview.local",
    password: "password123",
    role: "player"
  });

  const openCuneo = createEvent(organizer, {
    title: "Chess View Open Cuneo",
    description: "A weekend classical tournament for club players and ambitious juniors.",
    city: "Cuneo",
    venueName: "Academy Hall",
    address: "Via Demo 12, Cuneo",
    startDate: "2026-07-11T08:30:00.000Z",
    endDate: "2026-07-12T18:00:00.000Z",
    status: "published",
    registrationStatus: "open",
    timeControl: "60 min + 30 sec",
    maxPlayers: 80,
    contactEmail: "organizer@chessview.local",
    isPublic: true
  });

  const juniorRapid = createEvent(organizer, {
    title: "Junior Rapid Challenge",
    description: "A draft junior event with multiple age sections ready for organizer setup.",
    city: "Torino",
    venueName: "Youth Chess Room",
    address: "Corso Demo 4, Torino",
    startDate: "2026-08-22T08:00:00.000Z",
    endDate: "2026-08-22T16:30:00.000Z",
    status: "draft",
    registrationStatus: "closed",
    timeControl: "15 min + 10 sec",
    maxPlayers: 60,
    contactEmail: "organizer@chessview.local",
    isPublic: false
  });

  const familyFestival = createEvent(organizer, {
    title: "Sunday Family Chess Festival",
    description: "A completed rapid event used for standings, results, and public pairings demos.",
    city: "Alba",
    venueName: "Community Center",
    address: "Piazza Demo 8, Alba",
    startDate: "2026-05-17T08:30:00.000Z",
    endDate: "2026-05-17T17:00:00.000Z",
    status: "completed",
    registrationStatus: "closed",
    timeControl: "12 min + 3 sec",
    maxPlayers: 32,
    contactEmail: "organizer@chessview.local",
    isPublic: true
  });

  const open = createSection(openCuneo, {
    name: "Open",
    description: "Main section for all ratings.",
    maxPlayers: 80,
    timeControl: "60 min + 30 sec",
    roundsCount: 5
  });
  const under10 = createSection(openCuneo, {
    name: "Under 10",
    description: "Junior section for younger players.",
    maxPlayers: 24,
    birthYearMin: 2016,
    timeControl: "25 min + 10 sec",
    roundsCount: 5
  });
  createSection(juniorRapid, {
    name: "Under 16",
    maxPlayers: 36,
    birthYearMin: 2010,
    timeControl: "15 min + 10 sec",
    roundsCount: 6
  });
  const festivalOpen = createSection(familyFestival, {
    name: "Open",
    maxPlayers: 32,
    timeControl: "12 min + 3 sec",
    roundsCount: 3
  });

  createRegistration(openCuneo, open, player, {
    firstName: "Luca",
    lastName: "Bianchi",
    email: "player@chessview.local",
    club: "Cuneo Academy",
    rating: 1420,
    birthYear: 2009,
    status: "pending"
  });
  createRegistration(openCuneo, under10, player, {
    firstName: "Marta",
    lastName: "Rossi",
    email: "marta@example.local",
    club: "Junior Club",
    rating: 0,
    birthYear: 2017,
    status: "approved"
  });

  const ada = createPlayer(openCuneo, open, {
    firstName: "Ada",
    lastName: "Ferrero",
    federation: "ITA",
    club: "Cuneo Academy",
    rating: 1810,
    birthYear: 1998,
    email: "ada@example.local"
  });
  const bruno = createPlayer(openCuneo, open, {
    firstName: "Bruno",
    lastName: "Costa",
    federation: "ITA",
    club: "Torino Chess",
    rating: 1690,
    birthYear: 1988,
    email: "bruno@example.local"
  });

  const nora = createPlayer(familyFestival, festivalOpen, {
    firstName: "Nora",
    lastName: "Gallo",
    federation: "ITA",
    club: "Alba Scacchi",
    rating: 1720,
    birthYear: 2001,
    email: "nora@example.local"
  });
  const paolo = createPlayer(familyFestival, festivalOpen, {
    firstName: "Paolo",
    lastName: "Riva",
    federation: "ITA",
    club: "Cuneo Academy",
    rating: 1650,
    birthYear: 1991,
    email: "paolo@example.local"
  });
  const sara = createPlayer(familyFestival, festivalOpen, {
    firstName: "Sara",
    lastName: "Marino",
    federation: "ITA",
    club: "Junior Club",
    rating: 1510,
    birthYear: 2012,
    email: "sara@example.local"
  });
  const tommaso = createPlayer(familyFestival, festivalOpen, {
    firstName: "Tommaso",
    lastName: "Leone",
    federation: "ITA",
    club: "Alba Scacchi",
    rating: 1390,
    birthYear: 2014,
    email: "tommaso@example.local"
  });

  createRound(openCuneo, open, {
    number: 1,
    name: "Round 1",
    status: "published",
    startsAt: "2026-07-11T09:00:00.000Z"
  });
  createPairing(openCuneo, open, store.rounds[0], {
    boardNumber: 1,
    whitePlayer: ada._id,
    blackPlayer: bruno._id,
    result: "pending"
  });

  const r1 = createRound(familyFestival, festivalOpen, {
    number: 1,
    name: "Round 1",
    status: "completed",
    startsAt: "2026-05-17T09:00:00.000Z"
  });
  const r2 = createRound(familyFestival, festivalOpen, {
    number: 2,
    name: "Round 2",
    status: "completed",
    startsAt: "2026-05-17T11:00:00.000Z"
  });
  const r3 = createRound(familyFestival, festivalOpen, {
    number: 3,
    name: "Round 3",
    status: "completed",
    startsAt: "2026-05-17T14:00:00.000Z"
  });

  createPairing(familyFestival, festivalOpen, r1, {
    boardNumber: 1,
    whitePlayer: nora._id,
    blackPlayer: tommaso._id,
    result: "1-0"
  });
  createPairing(familyFestival, festivalOpen, r1, {
    boardNumber: 2,
    whitePlayer: paolo._id,
    blackPlayer: sara._id,
    result: "1/2-1/2"
  });
  createPairing(familyFestival, festivalOpen, r2, {
    boardNumber: 1,
    whitePlayer: sara._id,
    blackPlayer: nora._id,
    result: "0-1"
  });
  createPairing(familyFestival, festivalOpen, r2, {
    boardNumber: 2,
    whitePlayer: tommaso._id,
    blackPlayer: paolo._id,
    result: "0-1"
  });
  createPairing(familyFestival, festivalOpen, r3, {
    boardNumber: 1,
    whitePlayer: nora._id,
    blackPlayer: paolo._id,
    result: "1/2-1/2"
  });
  createPairing(familyFestival, festivalOpen, r3, {
    boardNumber: 2,
    whitePlayer: sara._id,
    blackPlayer: tommaso._id,
    result: "1-0"
  });

  store.seeded = true;
  store.admin = admin._id;
  store.organizer = organizer._id;
  return store;
};

module.exports = {
  store,
  byId,
  byEventOrSlug,
  clone,
  publicUser,
  createRecord,
  updateRecord,
  createUser,
  createEvent,
  createSection,
  createPlayer,
  createRound,
  createPairing,
  createRegistration,
  getEventBundle,
  summarizeEvent,
  seedMemoryStore,
  resetStore,
  slugify
};
