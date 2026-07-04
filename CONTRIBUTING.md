# Contributing To ChessView

Thank you for considering a contribution. ChessView is open source so the community can improve the core tournament platform while ChessView keeps its brand, production data, and commercial service assets sustainable.

## License

By submitting a contribution, you agree that your contribution is licensed under the GNU Affero General Public License v3.0 only, the same license as this repository.

## Clean-Room Requirement

Do not submit:

- Code copied from proprietary projects.
- Protected text, private assets, branding, credentials, cookies, or private user data.
- Vesus source code, branding, protected text, private assets, or private data.
- Scraped ChessView production data, local discovery data, source evidence, candidates, approved/rejected records, dedupe state, embeddings, or analytics data.

Use public behavior and documented workflows as inspiration, not proprietary implementation material.

## Data Boundary

Keep production data and local discovery workspaces out of pull requests. In particular, do not commit:

- `Codex News/`
- `Codex Tournaments/`
- `.env` or `.env.local`
- Uploads, logs, screenshots containing private data, or database dumps

## Developer Certificate

For now, ChessView uses a lightweight Developer Certificate of Origin style rule. By contributing, you certify that:

- You wrote the contribution or have the right to submit it.
- You are allowed to license it under AGPL-3.0-only.
- You are not knowingly submitting trade secrets, private data, or third-party material without permission.

For larger contributions, commercial integrations, or code intended for proprietary ChessView services, ChessView may require a separate written contributor agreement before accepting the work.

## Practical Workflow

Before opening a pull request:

- Keep the change focused.
- Add or update tests when behavior changes.
- Run the relevant verification command from the repository README.
- Update documentation when public behavior, APIs, licensing boundaries, data handling, or deployment steps change.

Security issues should be reported privately to the project owner instead of being opened as public issues.
