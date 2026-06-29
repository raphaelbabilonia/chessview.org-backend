# ChessView.org Backend

[![CI](https://github.com/raphaelbabilonia/chessview.org-backend/actions/workflows/ci.yml/badge.svg)](https://github.com/raphaelbabilonia/chessview.org-backend/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/raphaelbabilonia/chessview.org-backend/graph/badge.svg)](https://codecov.io/gh/raphaelbabilonia/chessview.org-backend)

ChessView is an open source platform for making physical chess events easier to publish, follow, and manage. This repository contains the Express API for the ChessView MVP.

The founding idea is to help clubs, academies, organizers, players, and spectators bring more over-the-board chess activity online. The current backend supports event management, registrations, manual tournament workflows, public pairings/results/standings, and early broadcast/device APIs for future camera-assisted game reconstruction.

The frontend lives at [raphaelbabilonia/chessview.org-frontend](https://github.com/raphaelbabilonia/chessview.org-frontend).

## Current MVP

- Public event API with search and filters.
- Authentication with JWT and password hashing.
- User roles: `player`, `organizer`, and `admin`.
- Organizer event CRUD with ownership checks.
- Tournament-source ingestion with scheduled jobs, source attribution, and deduplication.
- Sections, registrations, players, rounds, pairings, results, and standings.
- Manual pairings for the MVP.
- Broadcast/device endpoints for experimental camera frame upload workflows.
- Request validation with zod at the HTTP boundary (schemas double as mass-assignment allowlists).
- MongoDB persistence (Mongoose); tests run against an ephemeral in-memory MongoDB.
- Admin-only scrape source/job API for the separate admin frontend.

## Tech Stack

- Node.js (>= 20)
- Express
- MongoDB
- Mongoose
- JWT
- bcryptjs
- zod (input validation)
- dotenv
- cors
- multer

## Local Setup

A running MongoDB is required (`MONGO_URI`); there is no in-memory fallback. The
quickest way to get one locally:

```bash
docker run -d --name chessview-mongo -p 27017:27017 mongo:8
```

Then:

```bash
npm install
cp .env.example .env
npm run seed     # requires a reachable MongoDB at MONGO_URI
npm run dev
npm test         # runs the test suite against an ephemeral in-memory MongoDB
npm run coverage # same suite, with a c8 coverage report (text + coverage/lcov.info)
```

The API runs at `http://localhost:5000/api` by default.

## Environment Variables

Create `.env` from `.env.example`:

```env
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/chessview
JWT_SECRET=change-me-in-production
JWT_EXPIRES_IN=7d
CLIENT_URL=http://localhost:3000
CLIENT_URLS=http://localhost:3000,http://localhost:3001,http://localhost:5173,http://localhost:5174,http://127.0.0.1:3001,http://127.0.0.1:5173,http://127.0.0.1:5174
NODE_ENV=development
SCRAPER_USER_AGENT=ChessViewScraper/0.1 (+https://chessview.org)
SCRAPER_ORGANIZER_EMAIL=sources@chessview.local
SCRAPER_ORGANIZER_NAME=ChessView Sources
SCRAPER_WORKER_MODE=apply
SCRAPER_WORKER_INTERVAL_MS=60000
SCRAPER_WORKER_LIMIT=5
SCRAPER_WORKER_LEASE_MS=600000
SCRAPER_WORKER_ENSURE_DEFAULTS=true
```

Use a strong `JWT_SECRET` in any shared, staging, or production environment. Do not commit `.env`.

## Verification

Run the full local backend verification before pushing scraper/API changes:

```bash
npm run verify
```

This runs the Node test suite, checks JavaScript syntax, and audits dependencies at moderate severity or higher.

## Tournament Source Ingestion

The aggregator uses source-specific adapters. Structured APIs are preferred; cautious HTML/source discovery is only used when metadata is reliable and attribution stays clear.

Default source setup creates:

| Source | Type | Default | Notes |
| --- | --- | --- | --- |
| Vesus - Public | `vesus` | enabled | Public GraphQL/event-stream API from vesus.org. Imports event metadata, regulations, players/standings, tie-breaks, rounds, byes/forfeits, and Vesus Pairings results when publicly published. |
| Lichess Broadcasts - World | `lichess-broadcasts` | enabled | Structured API. Good global live/broadcast coverage. |
| ChessReg - USA | `chessreg-api` | enabled | Public API, good North America source. |
| Info64 - Spain and Latin America | `info64` | enabled | Public tournament pages with dates, locations, official/results links, attribution, and robots-aware rate limiting. |
| ChessArbiter - Poland | `chessarbiter` | enabled | Public Polish calendar table with source/result URLs and conservative filtering for non-tournament rows. |
| AICF - India | `aicf-calendar` | enabled | Public all-events table with event codes, dates, places, and brochure/regulations PDFs. Past events are skipped by default. |
| FIDE Calendar - Italy | `fide-calendar` | disabled | Discovers events, but does not import unless exact dates are available or date-window fallback is explicitly enabled. |
| FIDE Rated Tournaments - Italy | `fide-rated-tournaments` | disabled | Adapter is ready for DataTables JSON, but current direct endpoint probes returned empty responses. |
| Chess-Results - Global | `manual-review` | disabled | High-value source; partnership or a conservative adapter should be agreed before enabling. |
| Federscacchi - Italy | `manual-review` | disabled | Official pages confirmed, no stable structured event feed confirmed yet. |
| Vesus - Italy | `manual-review` | disabled | Legacy candidate record kept for review; the active public adapter is `vesus-public`. |
| US Chess, Chess.com, Tornelo, Schachbund, FFE, ECF, KNSB, Schaakkalender, Canadian Chess Federation | `manual-review` | disabled | Tracked as candidate sources. Some need source-specific adapters; some currently require API/partnership access or are blocked for server-side scraping. |

The runner defaults to dry-run mode:

```bash
npm run scrape:lichess -- --query world --limit 5
```

To persist the normalized events into MongoDB, run:

```bash
npm run scrape:lichess -- --query world --limit 5 --apply
```

Imported events are stored as public events owned by the technical source organizer configured through `SCRAPER_ORGANIZER_EMAIL`. Repeated imports update the same records by `source.originalId` or `source.url`, instead of creating duplicates.

For the longer-running ingestion flow, use configured scrape sources and jobs:

```bash
npm run scrape:sources -- --ensure-defaults
npm run scrape:sources -- --source vesus-public --mode dry-run --limit 5
npm run scrape:sources -- --source lichess-broadcasts-world --mode dry-run --limit 5
npm run scrape:sources -- --source chessreg-api-usa --mode dry-run --limit 5
npm run scrape:sources -- --source info64-spain-latam --mode dry-run --limit 5
npm run scrape:sources -- --source chessarbiter-poland --mode dry-run --limit 5
npm run scrape:sources -- --source aicf-india --mode dry-run --limit 5
npm run scrape:sources -- --source vesus-public --mode apply --limit 10
npm run scrape:sources -- --source lichess-broadcasts-world --mode apply --limit 5
npm run scrape:sources -- --source chessreg-api-usa --mode apply --limit 5
npm run scrape:sources -- --source info64-spain-latam --mode apply --limit 10
npm run scrape:sources -- --source chessarbiter-poland --mode apply --limit 10
npm run scrape:sources -- --source aicf-india --mode apply --limit 10
npm run scrape:sources -- --run-due --mode apply
```

Before enabling a worker or a new source, run:

```bash
npm run scrape:doctor -- --ensure-defaults --limit 2
npm run scrape:doctor -- --all --limit 1
```

To inspect local imported data without calling external websites, run:

```bash
npm run scrape:report
npm run scrape:report -- --active-from 2026-06-27
```

The report shows imported and active event counts, source status, latest scrape jobs, warnings, missing required fields, and duplicate checks.

To import tournament detail after metadata exists, use the detail importer. It refreshes imported sections, players, rounds, pairings, source standings, and event documents for supported sources, and keeps manual organizer data separate from imported records.

```bash
npm run scrape:details -- --source Vesus --download-documents --rate-limit-ms 1200 --max-document-bytes 15000000
npm run scrape:details -- --source Info64 --download-documents --rate-limit-ms 1000 --max-document-bytes 15000000
npm run scrape:details -- --source "Lichess Broadcasts" --download-documents --ignore-robots --rate-limit-ms 1000 --max-document-bytes 15000000
npm run scrape:details -- --source AICF --download-documents --rate-limit-ms 1000 --max-document-bytes 15000000
npm run scrape:details -- --source ChessArbiter --download-documents --rate-limit-ms 1000 --max-document-bytes 15000000
npm run scrape:details -- --source ChessReg --download-documents --rate-limit-ms 1000 --max-document-bytes 15000000
```

Current detail coverage:

| Source | Detail coverage |
| --- | --- |
| Vesus | Public event metadata, organizer/contact details, regulations, event links, source/result pages, players/standings, player titles, birth years, performance/rating changes, tie-breaks, match strings, rounds, pairings, accumulated board points, half-point byes, zero-point byes, and forfeits from Vesus Pairings when the tournament has published public rounds. Local VCE/VCT/TRF exports are not imported because the public export webhook is not available without the app's authenticated workspace context. |
| Info64 | Players, source standings, round pairings/results, standings/crosstable/games/stat links, PDF/XLS exports. One event can expose rounds with no pairing rows; in that case source standings still render. |
| Lichess Broadcasts | Rounds, players and pairings derived from PGN tags, PGN files, standings/regulation links. The PGN API is an official data endpoint, so local PGN download is run with `--ignore-robots` only for this source. |
| AICF | Source pages and brochure/regulation PDFs where available. The public calendar pages do not expose players, rounds, or pairings. |
| ChessArbiter | Source pages and useful PDF/Word attachments where exposed. The sampled public pages do not expose parseable players, rounds, or pairings. |
| ChessReg | Source registration links and metadata/capacity from the public API. Public detail/player endpoints were not found in the tested API surface. |

To audit imported coverage and generated files:

```bash
npm run events:audit -- --active-from 2026-06-29
npm run events:audit -- --active-from 2026-06-29 --check-links --concurrency 1 --link-delay-ms 500 --link-retry-delay-ms 3000 --link-timeout-ms 10000
```

Audit JSON/CSV files are written under `docs/audits/`. Use the slower link-check form for sources such as Info64 that return HTTP 429 if checked in bursts.

To backfill missing event metadata from already imported text without calling external websites, run:

```bash
npm run events:backfill
npm run events:backfill -- --apply
```

The backfill only fills empty `timeControl` or `ratingType` values when they can be inferred safely from stored title/description text.

For a long-running worker process, run:

```bash
npm run scrape:worker -- --mode apply --interval-ms 60000 --limit 5
```

The worker uses MongoDB-backed source leases (`lockedUntil` / `lockedBy`) so multiple worker processes do not claim the same due source at the same time. It is suitable for PM2, Docker, a system service, or any scheduler that supervises a process. In local development, use a reachable MongoDB instance through `MONGO_URI`.

The admin API exposes the same workflow under `/api/admin` and requires an admin JWT:

- `GET /api/admin/scrape-sources`
- `GET /api/admin/scrape-health`
- `POST /api/admin/scrape-sources/defaults`
- `POST /api/admin/scrape-sources`
- `PATCH /api/admin/scrape-sources/:id`
- `POST /api/admin/scrape-sources/:id/run`
- `POST /api/admin/scrape-jobs/run-due`
- `GET /api/admin/scrape-jobs`
- `GET /api/admin/scrape-jobs/:id`

Source adapters should use the shared scraper HTTP client so every integration has a clear `User-Agent`, timeout, per-host rate limiting, optional robots.txt checks, redirect handling, binary download limits, and POST form support. API sources such as Lichess Broadcasts and ChessReg can disable robots checks in source config while HTML scrapers should leave them enabled. Imported events deduplicate first by external source ID/URL and then by a normalized key built from title, start date, city, and country.

Do not import sources that cannot provide at least title, source URL, and trustworthy start date. The FIDE Calendar adapter intentionally skips map-discovered events when the exact event dates are not exposed.

## Demo Users

The seed script creates local/demo accounts:

- `organizer@chessview.local` / `password123`
- `admin@chessview.local` / `password123`
- `player@chessview.local` / `password123`

These credentials are local only. Never use demo secrets in production.

## API Overview

All app routes are served under `/api`.

- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/events`
- `GET /api/events/:id`
- `POST /api/events`
- `PATCH /api/events/:id`
- `DELETE /api/events/:id`
- `POST /api/events/:eventId/sections`
- `PATCH /api/sections/:sectionId`
- `DELETE /api/sections/:sectionId`
- `POST /api/events/:eventId/registrations`
- `GET /api/events/:eventId/registrations`
- `PATCH /api/registrations/:registrationId/status`
- `GET /api/events/:eventId/players`
- `POST /api/events/:eventId/players`
- `PATCH /api/players/:playerId`
- `DELETE /api/players/:playerId`
- `GET /api/events/:eventId/rounds`
- `POST /api/events/:eventId/rounds`
- `PATCH /api/rounds/:roundId`
- `GET /api/rounds/:roundId/pairings`
- `POST /api/rounds/:roundId/pairings`
- `PATCH /api/pairings/:pairingId/result`
- `GET /api/events/:eventId/standings`
- `GET /api/sections/:sectionId/standings`
- Broadcast/device endpoints for device registration, heartbeat, frame uploads, and pairing broadcast sessions.

Success responses generally use:

```json
{ "success": true, "data": {} }
```

Errors use:

```json
{ "success": false, "message": "Readable error message" }
```

## Known Limitations

- Some sources only expose tournament metadata/documents, not players or pairings.
- Advanced chess tiebreaks are not implemented yet.
- Chess-Results, Vesus, Federscacchi, US Chess, Chess.com, Tornelo, and several federation calendars still need a source-specific adapter, official feed, or partnership before automatic imports.
- Email notifications and real-time updates are future work.

## Clean-room Note

ChessView is a clean-room rebuild inspired by common chess tournament workflows. Do not copy Vesus source code, branding, protected text, private assets, credentials, cookies, or private user data into this project.

## License

This project is licensed under the GNU Affero General Public License v3.0. See [LICENSE](./LICENSE).
