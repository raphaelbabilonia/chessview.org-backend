const assert = require("node:assert/strict");
const test = require("node:test");
const { parseRobots } = require("../src/scrapers/httpClient");
const { discoverAicfTableTournaments, mapAicfDetail } = require("../src/scrapers/aicfCalendar");
const { discoverChessArbiterLinks, mapChessArbiterDetail } = require("../src/scrapers/chessArbiter");
const { mapChessRegTournament } = require("../src/scrapers/chessregApi");
const { eventLinksFromFeature, mapFideFeatureEvent } = require("../src/scrapers/fideCalendar");
const { mapFideRatedTournament } = require("../src/scrapers/fideRatedTournaments");
const { mapInfo64Detail, parseInfo64Players, parseInfo64RoundPairings, parseInfo64Standings } = require("../src/scrapers/info64");
const { mapBroadcastToTournament, parseLichessPgn, parseLocation } = require("../src/scrapers/lichessBroadcasts");
const { inferRatingType, inferTimeControl, parseEnglishDateRange } = require("../src/scrapers/tournamentUtils");
const { mapVesusEventTournament, mapVesusPairingsSnapshot, normalizeTimings, shortKeyFromUrl } = require("../src/scrapers/vesus");
const {
  buildDedupeKey,
  dataQualityScore,
  mergeExternalLinks,
  shouldRefreshImportedSlug
} = require("../src/services/tournamentMetadataImporter");
const { normalizeJobLimit } = require("../src/services/scrapeRunner");
const { documentTypeFor, normalizeResult } = require("../src/services/tournamentDetailImporter");
const calculateStandings = require("../src/utils/calculateStandings");
const { slugify } = require("../src/utils/slugify");

const lichessSample = {
  tour: {
    id: "AbN0a0LQ",
    name: "FIDE World Team Rapid & Blitz Chess Championships 2026 | Blitz | Knockout",
    slug: "fide-world-team-rapid-blitz-chess-championships-2026-blitz-knockout",
    info: {
      format: "16-team Knockout",
      tc: "3 min + 2 sec / move",
      fideTC: "blitz",
      location: "Hong Kong",
      website: "https://worldrapidblitzteams2026.fide.com/",
      standings: "https://s3.chess-results.com/tnr1442227.aspx?art=0",
      regulations: "https://handbook.fide.com/files/handbook/WRTC2026Regulations.pdf"
    },
    createdAt: 1781519977539,
    url: "https://lichess.org/broadcast/example/AbN0a0LQ",
    dates: [1781953320000, 1782043500000]
  },
  round: {
    id: "S0rYQx6z",
    name: "Finals | Game 2",
    startsAt: 1782043500000,
    url: "https://lichess.org/broadcast/example/round/S0rYQx6z"
  }
};

const chessRegSample = {
  id: 478,
  route: "icfopen",
  name: "Idaho Chess Federation - Idaho Open",
  url: "https://chessreg.com/icfopen",
  date: "2026-06-27T09:00:00-06:00",
  address: "2900 W Chinden Blvd, Garden City, ID 83714, USA",
  size: 66,
  note: "5SS G/90;d5. US Chess Rated - Game Notation Required."
};

test("maps Lichess broadcast metadata into ChessView tournament metadata", () => {
  const tournament = mapBroadcastToTournament(lichessSample, {
    checkedAt: new Date("2026-06-26T12:00:00.000Z")
  });

  assert.equal(tournament.title, lichessSample.tour.name);
  assert.equal(tournament.city, "Hong Kong");
  assert.equal(tournament.country, "Global");
  assert.equal(tournament.timeControl, "blitz");
  assert.equal(tournament.ratingType, "FIDE");
  assert.equal(tournament.originalId, "lichess:broadcast:AbN0a0LQ");
  assert.equal(tournament.resultsUrl, lichessSample.tour.info.standings);
});

test("normalizes locations defensively", () => {
  assert.deepEqual(parseLocation("Buenos Aires, Argentina"), {
    city: "Buenos Aires",
    country: "Argentina",
    venue: "Buenos Aires, Argentina"
  });
  assert.deepEqual(parseLocation("Hong Kong"), {
    city: "Hong Kong",
    country: "Global",
    venue: "Hong Kong"
  });
});

test("maps ChessReg API tournaments into minimal metadata", () => {
  const tournament = mapChessRegTournament(chessRegSample, {
    checkedAt: new Date("2026-06-26T12:00:00.000Z")
  });

  assert.equal(tournament.title, chessRegSample.name);
  assert.equal(tournament.city, "Garden City");
  assert.equal(tournament.country, "United States");
  assert.equal(tournament.timeControl, "standard");
  assert.equal(tournament.ratingType, "national");
  assert.equal(tournament.maxPlayers, 66);
  assert.equal(tournament.originalId, "chessreg:tournament:478");
});

test("maps Vesus public event cards into tournament metadata", () => {
  const event = {
    id: "event-1",
    name: "June's Combo",
    location: "Catania",
    start: "2026-06-28T14:00:00.000Z",
    end: "2026-06-28T18:45:00.000Z",
    registrationsLimit: 40,
    country: { code: "ITA" }
  };
  const tournament = {
    id: "tournament-1",
    name: "June's Rapid",
    shortKey: "itwv9mQu",
    start: "2026-06-28T14:00:00.000Z",
    end: "2026-06-28T16:45:00.000Z",
    rounds: 5,
    rated: false,
    participantsCount: 22,
    timeControlType: "RAPID",
    attendanceMode: "INPERSON",
    registrationsStatus: { status: "CLOSED" }
  };

  const mapped = mapVesusEventTournament(event, tournament, {
    checkedAt: new Date("2026-06-29T12:00:00.000Z"),
    timing: "ARCHIVED"
  });

  assert.equal(mapped.title, "June's Combo - June's Rapid");
  assert.equal(mapped.city, "Catania");
  assert.equal(mapped.country, "Italy");
  assert.equal(mapped.status, "completed");
  assert.equal(mapped.registrationStatus, "closed");
  assert.equal(mapped.timeControl, "rapid");
  assert.equal(mapped.ratingType, "unrated");
  assert.equal(mapped.sourceUrl, "https://vesus.org/tournament/itwv9mQu");
  assert.equal(mapped.resultsUrl, "https://vesus.org/pairings/itwv9mQu");
  assert.equal(mapped.originalId, "vesus:tournament:itwv9mQu");
});

test("uses current and future Vesus timings by default", () => {
  assert.deepEqual(normalizeTimings(), ["INPROGRESS", "FUTURE"]);
  assert.deepEqual(normalizeTimings("ARCHIVED"), ["ARCHIVED"]);
});

test("maps Vesus pairings stream snapshots into players, rounds, pairings, and documents", () => {
  const detail = mapVesusPairingsSnapshot(
    {
      name: "June's Rapid",
      shortKey: "itwv9mQu",
      rounds: 1,
      publishedRounds: 1,
      completedPublishedRounds: 1,
      timeControlType: "RAPID",
      timeControl: {
        periods: [{ white: { minutes: 12, increment: 3 } }]
      },
      pairingSystem: "SWISS_DUTCH_GACRUX",
      scoringSystem: "1/0.5/0",
      playersTieBreaks: ["BH/C1", "WIN"],
      tieBreakRating: 1400,
      event: {
        name: "June's Combo",
        shortKey: "Ru8-9zHX",
        regulation: "4d18924d-9d75-47fa-b5b7-1170a1bc6a9a.pdf",
        contactsEmail: "club@example.com",
        organiser: "Alberto D'Arrigo",
        links: ["https://example.com/event"]
      },
      pairingsPlayers: [
        {
          id: "p1",
          rankedId: 1,
          name: "Chindemi, Vincenzo",
          federation: "ITA",
          fideId: "552019861",
          fideRating: 1789,
          fideK: 40,
          nationalRating: 0,
          origin: "SR",
          title: "2N",
          birthDate: "1987",
          performanceRating: 1530,
          ratingChange: -2,
          tieBreaks: ["13", "2"],
          matches: ["1w2"],
          points: 1,
          rank: 1
        },
        {
          id: "p2",
          rankedId: 2,
          name: "Russo, Luciano",
          federation: "ITA",
          fideId: null,
          fideRating: 0,
          nationalRating: 1467,
          points: 0,
          rank: 2
        }
      ],
      pairings: [
        {
          id: "pairing-1",
          board: "1",
          round: 1,
          whiteId: 1,
          blackId: 2,
          whitePoints: 0,
          blackPoints: 0,
          result: "1 - 0"
        },
        {
          id: "pairing-without-public-players",
          board: "2",
          round: 1,
          whiteId: 99,
          blackId: 100,
          result: "1 - 0"
        }
      ]
    },
    {
      checkedAt: new Date("2026-06-29T12:00:00.000Z"),
      sourceUrl: "https://vesus.org/tournament/itwv9mQu"
    }
  );

  assert.equal(detail.sections.length, 1);
  assert.equal(detail.sections[0].timeControl, "12+3");
  assert.equal(detail.sections[0].pairingSystem, "SWISS_DUTCH_GACRUX");
  assert.deepEqual(detail.sections[0].tieBreaks, ["BH/C1", "WIN"]);
  assert.equal(detail.sections[0].players.length, 2);
  assert.equal(detail.sections[0].players[0].rating, 1789);
  assert.equal(detail.sections[0].players[0].title, "2N");
  assert.equal(detail.sections[0].players[0].birthYear, 1987);
  assert.deepEqual(detail.sections[0].players[0].tieBreaks, ["13", "2"]);
  assert.deepEqual(detail.sections[0].players[0].matches, ["1w2"]);
  assert.equal(detail.sections[0].players[1].rating, 1467);
  assert.equal(detail.sections[0].rounds.length, 1);
  assert.equal(detail.sections[0].rounds[0].status, "completed");
  assert.equal(detail.sections[0].rounds[0].pairings.length, 1);
  assert.equal(detail.sections[0].rounds[0].pairings[0].result, "1-0");
  assert.equal(detail.sections[0].rounds[0].pairings[0].sourceWhitePoints, 0);
  assert.equal(detail.eventMetadata.contactEmail, "club@example.com");
  assert.equal(detail.eventMetadata.sourceOrganizerName, "Alberto D'Arrigo");
  assert.equal(detail.documents.length, 5);
  assert.ok(detail.documents.some((document) => document.url === "https://vesus.org/assets/regulations/4d18924d-9d75-47fa-b5b7-1170a1bc6a9a.pdf"));
  assert.equal(shortKeyFromUrl("https://vesus.org/pairings/itwv9mQu"), "itwv9mQu");
});

test("maps Info64 tournament details from public metadata", () => {
  const html = `
    <html><head><title>IX OPEN DE AJEDREZ CANFRANC IRT SUB 2200 - info64.org</title></head>
    <body>
      <h1>IX OPEN DE AJEDREZ CANFRANC IRT SUB 2200</h1>
      <main>IX OPEN DE AJEDREZ CANFRANC IRT SUB 2200 Canfranc (Huesca), from 2026-06-26 to 2026-06-28
      Official website FIDE Chief Arbiter Rate of play: 60 minutes + 30 seconds per move</main>
    </body></html>`;
  const tournament = mapInfo64Detail(html, {
    checkedAt: new Date("2026-06-26T12:00:00.000Z"),
    sourceUrl: "https://info64.org/ix-open-de-ajedrez-canfranc-irt-sub-2200"
  });

  assert.equal(tournament.title, "IX OPEN DE AJEDREZ CANFRANC IRT SUB 2200");
  assert.equal(tournament.city, "Canfranc");
  assert.equal(tournament.country, "Spain");
  assert.match(tournament.description, /^Canfranc/);
  assert.equal(tournament.startDate, "2026-06-26T00:00:00.000Z");
  assert.equal(tournament.endDate, "2026-06-28T00:00:00.000Z");
  assert.equal(tournament.timeControl, "standard");
  assert.equal(tournament.ratingType, "FIDE");
});

test("parses Info64 ranking tables and round pairings", () => {
  const rankingHtml = `
    <table>
      <tr><th>Ran.</th><th>Tit.</th><th>Name</th><th>Fed.</th><th>FIDE</th><th>FIDE ID</th><th>Origin</th></tr>
      <tr><td>1</td><td>GM</td><td>Player One</td><td>ESP</td><td>2450</td><td>123456</td><td>Club A</td></tr>
      <tr><td>2</td><td></td><td>Player Two</td><td>ITA</td><td>2100</td><td>654321</td><td>Club B</td></tr>
    </table>`;
  const roundHtml = `
    <table>
      <tr><th>Brd.</th><th>White</th><th>Ran.</th><th>Pts.</th><th>FIDE</th><th>Fed.</th><th>Res.</th><th>Black</th><th>Ran.</th><th>Pts.</th><th>FIDE</th><th>Fed.</th></tr>
      <tr><td>1</td><td>Player One</td><td>1</td><td>0</td><td>2450</td><td>ESP</td><td>1-0</td><td>Player Two</td><td>2</td><td>0</td><td>2100</td><td>ITA</td></tr>
    </table>`;

  const players = parseInfo64Players(rankingHtml);
  const pairings = parseInfo64RoundPairings(roundHtml);

  assert.equal(players.length, 2);
  assert.equal(players[0].fideId, "123456");
  assert.equal(players[1].federation, "ITA");
  assert.equal(pairings.length, 1);
  assert.equal(pairings[0].boardNumber, 1);
  assert.equal(pairings[0].white.name, "Player One");
  assert.equal(pairings[0].black.name, "Player Two");
  assert.equal(pairings[0].result, "1-0");
});

test("parses Info64 standings and uses source standings when pairings are unavailable", () => {
  const standingsHtml = `
    <table>
      <tr><th>Pos.</th><th>Ran.</th><th>Tit.</th><th>Name</th><th>Fed.</th><th>Pts.</th><th>BH</th><th>FIDE</th><th>Origin</th></tr>
      <tr><td>1</td><td>2</td><td></td><td>Player Two</td><td>ITA</td><td>4.5</td><td>10</td><td>2100</td><td>Club B</td></tr>
      <tr><td>2</td><td>1</td><td>GM</td><td>Player One</td><td>ESP</td><td>4.0</td><td>9</td><td>2450</td><td>Club A</td></tr>
    </table>`;
  const sourceStandings = parseInfo64Standings(standingsHtml);
  const table = calculateStandings(
    sourceStandings.map((player, index) => ({
      _id: String(index + 1),
      firstName: player.name.split(" ")[0],
      lastName: player.name.split(" ").slice(1).join(" "),
      rating: player.rating,
      sourceRank: player.rank,
      sourcePoints: player.points
    })),
    []
  );

  assert.equal(sourceStandings.length, 2);
  assert.equal(sourceStandings[0].rank, 1);
  assert.equal(sourceStandings[0].points, 4.5);
  assert.equal(table[0].points, 4.5);
  assert.equal(table[0].position, 1);
});

test("parses Lichess broadcast PGN tags into pairings and players", () => {
  const pgn = `
[Event "Broadcast"]
[White "White Player"]
[Black "Black Player"]
[Result "1/2-1/2"]
[WhiteElo "2500"]
[BlackElo "2490"]
[WhiteFideId "111"]
[BlackFideId "222"]
[GameURL "https://lichess.org/game"]

1. e4 e5 1/2-1/2
`;
  const pairings = parseLichessPgn(pgn);

  assert.equal(pairings.length, 1);
  assert.equal(pairings[0].result, "1/2-1/2");
  assert.equal(pairings[0].white.rating, 2500);
  assert.equal(pairings[0].black.fideId, "222");
});

test("classifies source documents by file extension and normalizes common results", () => {
  assert.equal(documentTypeFor("https://example.com/rules.pdf", "regulations"), "pdf");
  assert.equal(documentTypeFor("https://example.com/export.xlsx", "results"), "excel");
  assert.equal(documentTypeFor("https://example.com/games", "results"), "results");
  assert.equal(normalizeResult("1/2"), "1/2-1/2");
  assert.equal(normalizeResult("1/2", { hasBlack: false }), "half-bye");
  assert.equal(normalizeResult("\u00bd - \u00bd"), "1/2-1/2");
  assert.equal(normalizeResult("\u00bd", { hasBlack: false }), "half-bye");
  assert.equal(normalizeResult("1", { hasBlack: false }), "bye-white");
  assert.equal(normalizeResult("0", { hasBlack: false }), "zero-bye");
  assert.equal(normalizeResult("1F - 0F"), "forfeit-black");
  assert.equal(normalizeResult("0F - 1F"), "forfeit-white");
});

test("maps ChessArbiter tournament details from public metadata", () => {
  const html = `
    <html><head><title>Grand Prix Magic Chess 2026 Wolb&oacute;rz [TOURNAMENT'S INFORMATION]</title></head>
    <body>Grand Prix Magic Chess 2026 Wolb&oacute;rz Wolb&oacute;rz 2026-03-21/2026-03-21 10' + 5'' na ruch</body></html>`;
  const tournament = mapChessArbiterDetail(html, {
    checkedAt: new Date("2026-06-26T12:00:00.000Z"),
    sourceUrl: "https://www.chessarbiter.com/turnieje/2026/ti_1200/"
  });

  assert.equal(tournament.title, "Grand Prix Magic Chess 2026 Wolbórz");
  assert.equal(tournament.city, "Wolbórz");
  assert.equal(tournament.country, "Poland");
  assert.equal(tournament.startDate, "2026-03-21T00:00:00.000Z");
  assert.equal(tournament.timeControl, "blitz");
});

test("discovers ChessArbiter tournaments from the public calendar table", () => {
  const html = `
    <table>
      <th class="th1" colspan="3">czerwiec 2026</th>
      <tr class="tbl1">
        <td>26-06<div class="szary">28-06</div></td>
        <td>
          <a href="https://www.chessarbiter.com/turnieje/open.php?turn=2026/ti_3605&n=">VI Turniej Szachowy</a>
          <div class="szary">Kartuzy [aktualizacja:25-06-2026]</div>
        </td>
        <td>Poland,PO <br><div class="szary">blitz</div></td>
      </tr>
      <tr class="tbl2">
        <td>27-06<div class="szary">planowany</div></td>
        <td>
          <a href="https://www.chessarbiter.com/turnieje/open.php?turn=2026/ti_99&n=">Kurs sędziowski</a>
          <div class="szary">on-line [aktualizacja:25-06-2026]</div>
        </td>
        <td>Poland,MA <br><div class="szary">inne</div></td>
      </tr>
    </table>`;
  const tournaments = discoverChessArbiterLinks(html, {
    endpoint: "https://www.chessarbiter.com/turnieje.php",
    limit: 5
  });

  assert.equal(tournaments.length, 1);
  assert.equal(tournaments[0].title, "VI Turniej Szachowy");
  assert.equal(tournaments[0].city, "Kartuzy");
  assert.equal(tournaments[0].startDate, "2026-06-26T12:00:00.000Z");
  assert.equal(tournaments[0].endDate, "2026-06-28T12:00:00.000Z");
  assert.equal(tournaments[0].timeControl, "blitz");
});

test("maps AICF tournament details from title dates", () => {
  const html = `
    <html><body><h1>28th Asian Youth Chess Championships - 2026 in Shenzhen, China from 15th to 25th July 2026</h1></body></html>`;
  const tournament = mapAicfDetail(html, {
    checkedAt: new Date("2026-06-26T12:00:00.000Z"),
    sourceUrl: "https://aicf.in/28th-asian-youth-chess-championships-2026-in-shenzhen-china-from-15th-to-25th-july-2026/"
  });

  assert.equal(tournament.city, "Shenzhen");
  assert.equal(tournament.country, "China");
  assert.equal(tournament.startDate, "2026-07-15T12:00:00.000Z");
  assert.equal(tournament.endDate, "2026-07-25T12:00:00.000Z");
});

test("discovers AICF tournaments from the public all-events table", () => {
  const html = `
    <table>
      <tr>
        <td>Name of Tournament</td><td>Event Code</td><td>Start Date</td><td>End Date</td><td>Place</td><td>Brochure</td>
      </tr>
      <tr>
        <td>International Chess Day Special FIDE Rated Rapid Chess Tournament - Tirupattur 2026</td>
        <td>485018</td><td>19-07-2026</td><td>19-07-2026</td><td>Tirupattur</td>
        <td><a href="https://aicf.in/wp-content/uploads/2026/06/event.pdf">Download</a></td>
      </tr>
      <tr>
        <td>Broken event</td><td>999</td><td>23-07-2027</td><td>26-07-2026</td><td>India</td><td></td>
      </tr>
    </table>`;
  const tournaments = discoverAicfTableTournaments(html, {
    endpoint: "https://aicf.in/all-events/",
    checkedAt: new Date("2026-06-26T12:00:00.000Z"),
    limit: 10
  });

  assert.equal(tournaments.length, 1);
  assert.equal(tournaments[0].originalId, "aicf:event:485018");
  assert.equal(tournaments[0].city, "Tirupattur");
  assert.equal(tournaments[0].startDate, "2026-07-19T12:00:00.000Z");
  assert.equal(tournaments[0].timeControl, "rapid");
  assert.equal(tournaments[0].regulationsUrl, "https://aicf.in/wp-content/uploads/2026/06/event.pdf");
});

test("parses English date ranges defensively", () => {
  assert.deepEqual(parseEnglishDateRange("from 14th to 21st April, 2026"), {
    startDate: "2026-04-14T12:00:00.000Z",
    endDate: "2026-04-21T12:00:00.000Z"
  });
  assert.deepEqual(parseEnglishDateRange("29 May - 6 June 2026"), {
    startDate: "2026-05-29T12:00:00.000Z",
    endDate: "2026-06-06T12:00:00.000Z"
  });
});

test("does not infer FIDE rating from unrelated words", () => {
  assert.equal(inferRatingType("learn the game and start playing with confidence"), "");
  assert.equal(inferRatingType("FIDE rated open"), "FIDE");
});

test("infers common time controls from minutes and increments", () => {
  assert.equal(inferTimeControl("Rate of play: 60 minutes + 30 seconds per move"), "standard");
  assert.equal(inferTimeControl("G/90;d5. US Chess Rated"), "standard");
  assert.equal(inferTimeControl("50 minutes + 10 seconds per move"), "rapid");
  assert.equal(inferTimeControl("25 min + 10 sec"), "rapid");
  assert.equal(inferTimeControl("10' + 5'' na ruch"), "blitz");
  assert.equal(inferTimeControl("3 min + 2 sec / move"), "blitz");
});

test("discovers FIDE Calendar event links without importing missing dates by default", () => {
  const feature = {
    properties: {
      venue_name: "Hotel Vila Angela",
      description: "Via Provinciale Panza, 248, 80075 Forio NA, Italy",
      events_list: "<a href='calendar.php?id=12432'>17th Chess Festival Ischia the Green Island</a>"
    }
  };
  const [event] = eventLinksFromFeature(feature);
  const mapped = mapFideFeatureEvent(feature, event, {
    fromDate: "2026-06-26",
    toDate: "2026-12-31"
  });

  assert.equal(event.id, "12432");
  assert.equal(mapped.skipped, true);
  assert.match(mapped.reason, /exact event dates/);
});

test("maps FIDE Rated DataTables rows when endpoint provides data", () => {
  const tournament = mapFideRatedTournament(["12345", "Italian Open", "Rome", "S", "2026-09-01"], {
    checkedAt: new Date("2026-06-26T12:00:00.000Z"),
    country: "Italy"
  });

  assert.equal(tournament.title, "Italian Open");
  assert.equal(tournament.city, "Rome");
  assert.equal(tournament.country, "Italy");
  assert.equal(tournament.ratingType, "FIDE");
  assert.equal(tournament.originalId, "fide-rated:event:12345");
});

test("builds stable dedupe keys across equivalent source records", () => {
  const base = {
    title: "FIDE World Team Rapid & Blitz Chess Championships 2026",
    startDate: "2026-06-20T11:02:00.000Z",
    city: "Hong Kong",
    country: "Global"
  };
  const variant = {
    title: "FIDE World Team Rapid Blitz Chess Championships 2026!",
    startDate: "2026-06-20T08:00:00.000Z",
    city: "hong   kong",
    country: "global"
  };

  assert.equal(buildDedupeKey(base), buildDedupeKey(variant));
});

test("builds readable SEO slugs without cutting tournament words", () => {
  assert.equal(slugify(lichessSample.tour.name), lichessSample.tour.slug);
  assert.equal(slugify("Torneo Internacional de C\u00f3rdoba 2026"), "torneo-internacional-de-cordoba-2026");

  const longSlug = slugify(
    "International Open Chess Championship with Youth Rapid Blitz Classical Invitational Finals 2026 Extra"
  );

  assert.ok(longSlug.length <= 100);
  assert.ok(!longSlug.endsWith("-"));
  assert.ok(!longSlug.endsWith("extr"));
});

test("refreshes only missing or legacy imported slugs", () => {
  assert.equal(
    shouldRefreshImportedSlug(
      { slug: "fide-world-team-rapid-blitz-chess-championships-2026-blitz-k" },
      lichessSample.tour.name
    ),
    true
  );
  assert.equal(shouldRefreshImportedSlug({ slug: lichessSample.tour.slug }, "Renamed Event Title"), false);
  assert.equal(
    shouldRefreshImportedSlug(
      { slug: "old-imported-title", source: { name: "Vesus", originalId: "vesus:tournament:abc" } },
      "Fresh Imported Title"
    ),
    true
  );
  assert.equal(shouldRefreshImportedSlug({ slug: "" }, lichessSample.tour.name), true);
});

test("scores richer tournament metadata higher than sparse metadata", () => {
  const rich = mapBroadcastToTournament(lichessSample);
  const sparse = { title: "Local Open", startDate: "2026-01-01T00:00:00.000Z" };

  assert.ok(dataQualityScore(rich) > dataQualityScore(sparse));
});

test("merges external links by type and URL", () => {
  const merged = mergeExternalLinks(
    [{ type: "source", url: "https://example.com/a", label: "Original", sourceName: "A" }],
    [
      { type: "source", url: "https://example.com/a", label: "Original source", sourceName: "B" },
      { type: "results", url: "https://example.com/results", label: "Results", sourceName: "B" }
    ]
  );

  assert.equal(merged.length, 2);
  assert.ok(merged.some((link) => link.type === "results"));
});

test("deduplicates external links by URL", () => {
  const merged = mergeExternalLinks(
    [{ type: "source", url: "https://example.com/a", label: "Original", sourceName: "A" }],
    [{ type: "website", url: "https://example.com/a", label: "Official website", sourceName: "A" }]
  );

  assert.equal(merged.length, 1);
});

test("parses matching robots groups", () => {
  const groups = parseRobots(
    `
User-agent: *
Disallow: /private
Allow: /private/public
`,
    "ChessViewScraper"
  );

  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].disallow, ["/private"]);
  assert.deepEqual(groups[0].allow, ["/private/public"]);
});

test("normalizes scrape worker job limits defensively", () => {
  assert.equal(normalizeJobLimit(undefined), 5);
  assert.equal(normalizeJobLimit("bad"), 5);
  assert.equal(normalizeJobLimit(0), 1);
  assert.equal(normalizeJobLimit(3.8), 3);
  assert.equal(normalizeJobLimit(999), 20);
});
