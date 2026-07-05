# ChessView.org Backend

[![CI](https://github.com/raphaelbabilonia/chessview.org-backend/actions/workflows/ci.yml/badge.svg)](https://github.com/raphaelbabilonia/chessview.org-backend/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/raphaelbabilonia/chessview.org-backend/graph/badge.svg)](https://codecov.io/gh/raphaelbabilonia/chessview.org-backend)

ChessView is an open source platform for making physical chess events easier to publish, follow, and manage. This repository contains the Express API for the ChessView MVP.

The founding idea is to help clubs, academies, organizers, players, and spectators bring more over-the-board chess activity online. The current backend supports event management, registrations, manual tournament workflows, public pairings/results/standings, and early broadcast/device APIs for future camera-assisted game reconstruction.

The frontend lives at [raphaelbabilonia/chessview.org-frontend](https://github.com/raphaelbabilonia/chessview.org-frontend).

## Open Source And Commercial Boundaries

- Source code is licensed under AGPL-3.0-only.
- The ChessView name, ChessView.org name, logos, icons, domains, and brand identity are reserved trademarks/brand assets. See [TRADEMARKS.md](./TRADEMARKS.md).
- Production databases, curated tournament/news data, local discovery workspaces, source evidence, dedupe state, AI search indexes, analytics databases, embeddings, recommendations, uploads, and commercial datasets are not open source. See [DATA_LICENSE.md](./DATA_LICENSE.md).
- Contributors must keep private data, third-party proprietary material, credentials, and local discovery output out of pull requests. See [CONTRIBUTING.md](./CONTRIBUTING.md).
- The official hosted ChessView service may include paid hosting, support, integrations, AI search, analytics, and other commercial services built around the AGPL core.

See [OPEN_SOURCE_POLICY.md](./OPEN_SOURCE_POLICY.md) for the full policy.

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
- Curated data workflow: event/news source metadata is stored only when entered manually or by a supervised agentic workflow.
- Agentic publishing: approved JSON can be published through private `/api/agent-ingest/*` endpoints guarded by `AGENT_PUBLISH_TOKEN`; secrets stay in production env or local `.env.local`, never in the public repo.
- Public agent collaboration: external agents can submit source-first tournament and news candidates to `/api/agent-collaboration/submissions`; submissions enter a queue and never publish immediately.

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
JWT_SECRET=change-this-local-secret-before-deploying
JWT_EXPIRES_IN=7d
CLIENT_URL=http://localhost:3000
CLIENT_URLS=http://localhost:3000,http://localhost:3001,http://localhost:5173,http://localhost:5174,http://127.0.0.1:3000,http://127.0.0.1:3001,http://127.0.0.1:5173,http://127.0.0.1:5174
NODE_ENV=development
TRACKING_ENABLED=true
TRACKING_DASHBOARD_CODE=cv-tracking-4f7e9d2b-2026
TRACKING_ALLOWED_ORIGINS=http://localhost:3001,http://127.0.0.1:3001
TRACKING_SALT=change-this-local-tracking-salt
```

Use a strong `JWT_SECRET` in any shared, staging, or production environment. Do not commit `.env`.

## First-Party Tracking

The API includes an internal analytics endpoint for the public Next.js site:

- `POST /api/tracking/events` stores pageviews, filter usage, language/theme changes, and outbound click events.
- `GET /api/tracking/dashboard/:code?days=30&rollup=true` returns rollups for the hidden dashboard.
- Visitor and session ids are HMAC hashed before storage; raw browser ids are not stored.
- Tracking events expire after 90 days through the MongoDB TTL index on `receivedAt`.

Run tracking maintenance locally with:

```bash
npm run tracking:audit
npm run tracking:rollup -- --days=90
```

`npm run tracking:audit` writes local-only run history under the ignored `Codex Tracking/` workspace.

## Verification

Run the full local backend verification before pushing API changes:

```bash
npm run verify
```

This runs the Node test suite, checks JavaScript syntax, and audits dependencies at moderate severity or higher.

## Curated Tournament Data

The backend does not run automatic scrapers, crawler jobs, or source-specific API importers. Public event data is created and updated through the ChessView API by organizers, admins, or supervised agentic workflows that review source material before publishing.

Local discovery workspaces such as `Codex News/` and `Codex Tournaments/` are proprietary operational folders. They are ignored by Git and should not be committed to the public repository.

Event records still preserve source and attribution fields such as `source`, `externalLinks`, `websiteUrl`, `resultsUrl`, and `regulationsUrl`. These fields are for curated/manual metadata and public links, not for backend-side automatic ingestion.

To backfill missing event metadata from already imported text without calling external websites, run:

```bash
npm run events:backfill
npm run events:backfill -- --apply
```

The backfill only fills empty `timeControl` or `ratingType` values when they can be inferred safely from stored title/description text.

To keep country coverage maps complete without trying to map the whole world, run the coordinate backfill. By default it scans only active public tournaments already in the database and prints a dry-run report:

```bash
npm run events:coordinates
npm run events:coordinates -- --apply
```

The command first uses the curated city table for known tournament locations. To let a weekly maintenance run look up new current gaps through OpenStreetMap Nominatim, enable the throttled geocoder:

```bash
npm run events:coordinates -- --geocode --apply
```

Set `CHESSVIEW_GEOCODER_USER_AGENT`, `GEOCODING_MAX_PER_RUN`, and `GEOCODING_DELAY_MS` in production if the scheduled job uses geocoding. The default geocoding cap is 500 unique locations per run so a weekly pass can cover the current production tournament set while still throttling requests. The script stores resolved coordinates in `location.coordinates` and `metadata.logistics.coordinates` so the public Next.js country maps can render tournament dots.

When direct database access is not the authoritative production path, use the private API-based coordinate backfill. It reads public events from `CHESSVIEW_API_BASE_URL`, resolves missing current locations, and posts coordinate-only updates through `/api/agent-ingest/coordinates`:

```bash
npm run events:coordinates:api -- --geocode --apply
```

## News Discovery Workflow

Use the local news automation to collect source-first article cards from RSS/Atom feeds and lightweight publisher metadata:

```bash
npm run agent:discover-news
npm run agent:publish -- --domain news --publish
```

`agent:discover-news` reads `Codex News/sources/priority-sources.json`, writes evidence, candidates, approved JSON, and dedupe state under the ignored `Codex News/` workspace, and requires publisher images. The default target is 20 items. Use `--target=50` for a larger run, `--source=chess-com-news,fide-news` to focus sources, or `--candidates-only` for review-only output.

News articles require an absolute publisher image URL. Discovery, local publishing gates, API ingest, and public news queries all reject or hide records without images. The publish step also attempts to repair missing image fields from source-page metadata before rejecting a record. To remove older rows created before this rule, run a dry check first:

```bash
npm run news:prune-missing-images
```

Then delete image-less rows from the configured MongoDB:

```bash
npm run news:prune-missing-images -- --delete
```

The automation stores titles, short original bridge summaries, attribution, canonical links, dates, tags, and image URLs. It does not download publisher images, copy full articles, bypass paywalls, write directly to MongoDB, or publish without the separate private ingest step.

## Public Agent Collaboration Workflow

The public collaboration queue lets external agents contribute source-first metadata without receiving private publisher credentials.

Machine-readable docs:

- `GET /api/agent-collaboration/openapi.json`
- `GET /api/agent-collaboration/schema.json`

Submission endpoint:

```bash
curl -X POST http://127.0.0.1:5000/api/agent-collaboration/submissions \
  -H "Content-Type: application/json" \
  -d '{"schemaVersion":1,"agent":{"name":"Example Agent"},"items":[{"kind":"event","title":"Example Open","startDate":"2026-11-10","country":"Italy","city":"Milano","sourceName":"Organizer","sourceUrl":"https://example.org/open","confidence":0.9}]}'
```

Rules:

- V1 accepts `event`/`tournament` and `news` items only.
- Public submissions are rate-limited, validated, deduplicated, and stored as queued `AgentSubmission` records.
- Unsafe URLs, localhost/private-network URLs, copied full articles, credentials, cookies, private data, and oversized payloads are rejected.
- Weekly review is dry-run by default: `npm run agent:review-public`.
- Publish mode: `npm run agent:review-public -- --publish`.
- High-confidence accepted items are promoted through the same private ingest logic used by `agent:publish`; low-confidence or risky items are quarantined.

## Demo Users

The seed script creates local/demo accounts:

- `organizer@chessview.local` / `password123`
- `admin@chessview.local` / `password123`
- `player@chessview.local` / `password123`

These credentials are local only. Never use demo secrets in production.

## API Overview

All app routes are served under `/api`.

Public event lists hide past events by default. To request archive-style results, pass `includePast=true`, or provide an explicit date window with `from`, `to`, or `activeFrom`.

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
- External tournament and news discovery is intentionally handled outside this backend by supervised manual or agentic workflows.
- The backend may receive already-approved agentic JSON through private ingest endpoints, but it does not scrape external websites or publish unvalidated items directly.
- Email notifications and real-time updates are future work.

## Clean-room Note

ChessView is a clean-room rebuild inspired by common chess tournament workflows. Do not copy Vesus source code, branding, protected text, private assets, credentials, cookies, or private user data into this project.

## License

This project source code is licensed under the GNU Affero General Public License v3.0 only. See [LICENSE](./LICENSE).

The code license does not grant rights to ChessView trademarks, brand assets, production data, curated datasets, AI/analytics assets, private infrastructure, or hosted-service data. See [OPEN_SOURCE_POLICY.md](./OPEN_SOURCE_POLICY.md).
