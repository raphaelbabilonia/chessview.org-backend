# ChessView.org Backend

ChessView is an open source platform for making physical chess events easier to publish, follow, and manage. This repository contains the Express API for the ChessView MVP.

The founding idea is to help clubs, academies, organizers, players, and spectators bring more over-the-board chess activity online. The current backend supports event management, registrations, manual tournament workflows, public pairings/results/standings, and early broadcast/device APIs for future camera-assisted game reconstruction.

The frontend lives at [raphaelbabilonia/chessview.org-frontend](https://github.com/raphaelbabilonia/chessview.org-frontend).

## Current MVP

- Public event API with search and filters.
- Authentication with JWT and password hashing.
- User roles: `player`, `organizer`, and `admin`.
- Organizer event CRUD with ownership checks.
- Sections, registrations, players, rounds, pairings, results, and standings.
- Manual pairings for the MVP.
- Broadcast/device endpoints for experimental camera frame upload workflows.
- Request validation with zod at the HTTP boundary (schemas double as mass-assignment allowlists).
- MongoDB persistence (Mongoose); tests run against an ephemeral in-memory MongoDB.

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
NODE_ENV=development
```

Use a strong `JWT_SECRET` in any shared, staging, or production environment. Do not commit `.env`.

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

- Pairings are manual.
- Advanced chess tiebreaks are not implemented yet.
- Federation integrations, CSV/PDF workflows, email notifications, real-time updates, and multilingual support are future work.

## Clean-room Note

ChessView is a clean-room rebuild inspired by common chess tournament workflows. Do not copy Vesus source code, branding, protected text, private assets, credentials, cookies, or private user data into this project.

## License

This project is licensed under the GNU Affero General Public License v3.0. See [LICENSE](./LICENSE).
