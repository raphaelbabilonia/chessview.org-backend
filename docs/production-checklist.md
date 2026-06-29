# Production Checklist

Use this before putting ChessView scraping or public pages on a real domain.

## Required Environment

- `NODE_ENV=production`
- Reachable production `MONGO_URI`
- Strong `JWT_SECRET`, at least 32 random characters.
- Production `MONGO_URI`.
- `CLIENT_URLS` with the exact admin/public frontend origins.
- `SCRAPER_USER_AGENT` that identifies ChessView and includes a contact URL or email.
- `SCRAPER_WORKER_MODE=apply` only after dry-runs are clean.

## Scraping Rollout

1. Run `npm run scrape:sources -- --ensure-defaults`.
2. Run `npm run scrape:doctor -- --limit 2`.
3. Run one source manually in `dry-run`.
4. Run one source manually in `apply`.
5. Check `/api/admin/scrape-health`.
6. Start one supervised worker process.
7. Add more worker processes only after confirming Mongo leases prevent duplicate claims.

## Source Policy

- Prefer official APIs or explicit partnerships.
- Keep `sourceUrl` and source attribution visible.
- Do not copy full regulations, full PDFs, full rankings, or private user data.
- Respect robots.txt and source-specific rate limits.
- Leave sources disabled if they do not expose trustworthy dates.

## Suggested Process Supervisors

- Docker Compose for simple VPS deployments.
- PM2 if deploying directly on a Node host.
- A platform worker process if using Render/Fly/Railway/etc.

The worker is stateless except for Mongo-backed leases and jobs, so it can be restarted safely.
