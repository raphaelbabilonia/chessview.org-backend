# Priority Sources for Chess Tournament Aggregator

Objective: create an SEO-first aggregator that shows only the essential tournament information and always redirects users to the original source.

## General Rules

* Extract only basic metadata: name, dates, city, country, time control, rating system, registration link, results link, and original source.
* Do not copy full PDFs, full regulations, or full rankings unless necessary.
* Respect robots.txt, terms of use, and rate limits.
* Prioritize APIs or partnerships when available.
* Always store `sourceUrl` and show clear attribution.

---

## Priority 1 — Essential Sources for MVP

| Priority | Source                 | URL                                              | Region              | Access Type                    | Note                                                                  |
| -------: | ---------------------- | ------------------------------------------------ | ------------------- | ------------------------------ | --------------------------------------------------------------------- |
|        1 | Chess-Results          | https://chess-results.com                        | Global              | Careful scraping / partnership | Most important global source for results, pairings, and tournaments.  |
|        2 | FIDE Calendar          | https://calendar.fide.com                        | Global              | Careful scraping               | Official FIDE events calendar.                                        |
|        3 | FIDE Rated Tournaments | https://ratings.fide.com/rated_tournaments.phtml | Global              | Careful scraping               | Rated tournaments by country. Review legal restrictions.              |
|        4 | Vesus                  | https://vesus.org                                | Italy               | Careful scraping / partnership | Key source for Italian tournaments. Ideally contact them.             |
|        5 | Federscacchi           | https://www.federscacchi.it                      | Italy               | Scraping                       | Official Italian calendar.                                            |
|        6 | ChessReg               | https://chessreg.com                             | USA / North America | API                            | Very good source because it has documented API access.                |
|        7 | US Chess               | https://new.uschess.org/upcoming-tournaments     | USA                 | Scraping                       | Official United States tournament calendar.                           |
|        8 | Lichess Broadcasts     | https://lichess.org/broadcast                    | Global              | API                            | Useful for live tournaments and broadcasted games.                    |
|        9 | Chess.com Events       | https://www.chess.com/events                     | Global              | Partial API / scraping         | Useful for major and online events.                                   |
|       10 | Tornelo                | https://tornelo.com                              | Global              | Partnership / careful scraping | Modern platform with registrations, payments, and hybrid tournaments. |

---

## Priority 2 — Important National Sources

| Priority | Source                    | URL                             | Region                | Access Type                    | Note                                                |
| -------: | ------------------------- | ------------------------------- | --------------------- | ------------------------------ | --------------------------------------------------- |
|       11 | Info64                    | https://info64.org              | Spain / Latin America | Scraping                       | Very important for Spain and FIDE tournaments.      |
|       12 | ChessArbiter              | https://www.chessarbiter.com    | Poland / Europe       | Scraping                       | Widely used in Poland.                              |
|       13 | Deutscher Schachbund      | https://www.schachbund.de       | Germany               | Scraping                       | Official German calendar.                           |
|       14 | FFE                       | https://www.echecs.asso.fr      | France                | Scraping                       | French federation, calendar, and rated tournaments. |
|       15 | ECF                       | https://www.englishchess.org.uk | United Kingdom        | Scraping                       | Official English events.                            |
|       16 | KNSB                      | https://schaakbond.nl           | Netherlands           | Scraping                       | Dutch federation.                                   |
|       17 | Schaakkalender            | https://www.schaakkalender.nl   | Netherlands           | Scraping                       | Strong local calendar.                              |
|       18 | AICF                      | https://aicf.in                 | India                 | Scraping                       | Official Indian source.                             |
|       19 | CircleChess               | https://circlechess.com         | India                 | Partnership / careful scraping | Modern platform for registrations and tournaments.  |
|       20 | Canadian Chess Federation | https://www.chess.ca            | Canada                | Scraping                       | Canadian tournament calendar.                       |

---

## Priority 3 — Competitors / Benchmarks, Not Primary Sources

These sites are useful for studying coverage, UX, and SEO. They should not be the main data source if we can access the original source directly.

| Site                 | URL                                        | Recommended Use                                  |
| -------------------- | ------------------------------------------ | ------------------------------------------------ |
| Chess Calendar EU    | https://chess-calendar.eu                  | Main benchmark. Already aggregates many sources. |
| Chess Mix            | https://www.chessmix.com/chess-tournaments | Global calendar benchmark.                       |
| MyChess.events       | https://mychess.events                     | Modern benchmark for OTB tournaments.            |
| Chessaround          | https://chessaround.com                    | Discovery benchmark.                             |
| Chessdom Calendar    | https://calendar.chessdom.com              | Editorial benchmark.                             |
| World Chess Calendar | https://worldchesscalendar.com             | Country-based SEO benchmark.                     |
| ChessPrime Calendar  | https://chessprime.com                     | Long-tail country-based benchmark.               |

---

## Recommended Implementation Order

### Phase 1 — Italy + Global MVP

1. Vesus
2. Federscacchi
3. Chess-Results
4. FIDE Calendar
5. FIDE Rated Tournaments
6. Lichess Broadcasts

### Phase 2 — USA and Major Countries

1. ChessReg API
2. US Chess
3. Tornelo
4. Info64
5. ChessArbiter
6. AICF India

### Phase 3 — European Expansion

1. Germany — Deutscher Schachbund
2. France — FFE
3. United Kingdom — ECF
4. Netherlands — KNSB / Schaakkalender
5. Canada — Chess Federation of Canada

---

## Minimum Fields to Extract

```ts
type Tournament = {
  title: string;
  startDate: string;
  endDate?: string;
  country: string;
  city?: string;
  venue?: string;
  timeControl?: 'standard' | 'rapid' | 'blitz' | 'mixed';
  ratingType?: 'FIDE' | 'national' | 'unrated';
  sourceName: string;
  sourceUrl: string;
  registrationUrl?: string;
  resultsUrl?: string;
  originalId?: string;
  lastCheckedAt: string;
};
```

---

## Important Technical Note

The hardest part will not be scraping, but deduplication.

The same tournament may appear on:

* Vesus
* Federscacchi
* FIDE
* Chess-Results
* the organizing club’s website
* Lichess Broadcast

That is why a deduplication system should be created using:

* normalized tournament name
* start date
* city
* country
* external ID, if available
* original URL
* textual similarity

---

## Final Recommendation

To start, do not try to cover “the whole world”.

First build a solid MVP with:

* Italy
* FIDE
* Chess-Results
* Lichess Broadcasts
* ChessReg USA

Then expand country by country based on real user demand and source quality.
