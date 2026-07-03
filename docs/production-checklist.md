# Production Checklist

Use this before putting ChessView API or public pages on a real domain.

## Required Environment

- `NODE_ENV=production`
- Reachable production `MONGO_URI`
- Strong `JWT_SECRET`, at least 32 random characters.
- `CLIENT_URLS` with the exact admin/public frontend origins.

## GitHub Actions Deployment

The production deploy workflows use the same SSH secret pattern as the HOC landing-page repository:

- `VPS_HOST`: the VPS host or IP address, for example `148.230.112.224`.
- `VPS_USERNAME`: a root or sudo-capable deploy user on the VPS.
- `VPS_SSH_KEY`: the private SSH key whose public key is authorized for `VPS_USERNAME`.

Runtime API secrets are intentionally kept on the VPS, not in GitHub Actions. Before the first deploy, create:

```env
/home/chessview-api/htdocs/api.chessview.org/.env

NODE_ENV=production
PORT=4000
MONGO_URI=mongodb://127.0.0.1:27017/chessview
JWT_SECRET=<at-least-32-random-characters>
JWT_EXPIRES_IN=7d
CLIENT_URLS=https://chessview.org,https://www.chessview.org,https://app.chessview.org,https://www.app.chessview.org
AGENT_PUBLISH_TOKEN=<separate-random-agent-token>
AGENT_PUBLISH_USER_EMAIL=<admin-or-organizer-email>
AGENT_SERVICE_USER_EMAIL=agent-publisher@chessview.local
```

Generate `JWT_SECRET` with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

The backend workflow assumes CloudPanel has a Node.js site for `api.chessview.org` using site user `chessview-api`, with nginx proxying to port `4000`. If CloudPanel creates a different site user or path, update `SITE_USER` and `TARGET_DIR` in `.github/workflows/deploy-backend.yml`.

## Data Rollout

1. Seed only staging/demo environments; do not seed production with demo accounts.
2. Create or import public event data through the authenticated API or a supervised agentic workflow.
3. Review source attribution, official links, dates, and publication status before exposing events publicly.
4. Configure the local publisher with `CHESSVIEW_API_BASE_URL=https://api.chessview.org/api` and the matching `CHESSVIEW_AGENT_PUBLISH_TOKEN` in `.env.local` or machine env only.
5. Verify `/api/health`, `/api/events`, `/api/news`, and at least one event detail route against production data.

## Source Policy

- The backend must not run automatic scrapers, crawlers, or external API import workers.
- Keep official source attribution visible when curated data references an organizer or publisher.
- Do not copy full regulations, full PDFs, full rankings, or private user data unless the source and usage are explicitly permitted.
- Agentic data gathering should review and normalize information before writing it through private ingest endpoints.
- Do not use direct MongoDB writes or VPS SSH scripts as the normal publishing path.

## Suggested Process Supervisors

- Docker Compose for simple VPS deployments.
- PM2 if deploying directly on a Node host.
- Platform web services if using Render/Fly/Railway/etc.
