# ChessView Open Source Policy

Last updated: 2026-07-03

This repository is part of the ChessView platform. The project is open source so clubs, organizers, players, and developers can inspect, run, improve, and contribute to the core software.

This policy explains the boundary between the open-source code and the assets ChessView keeps reserved for sustainability.

## Code License

Unless a file says otherwise, the source code in this repository is licensed under the GNU Affero General Public License v3.0 only. See [LICENSE](./LICENSE).

You may run, study, modify, and share the code under the AGPL. If you modify the AGPL-covered software and make it available to users over a network, the AGPL source-offer obligations apply.

## Reserved Brand

The AGPL code license does not grant permission to use the ChessView name, ChessView.org name, logos, icons, wordmarks, domain names, trade dress, or other brand identifiers.

See [TRADEMARKS.md](./TRADEMARKS.md).

## Reserved Data And AI Assets

The AGPL code license does not cover ChessView production data or proprietary information assets.

Reserved assets include production databases, scraped or curated tournament/news datasets, source registries, evidence files, run manifests, candidate/rejected/approved review files, dedupe indices, analytics databases, ranking/recommendation data, embeddings, vector indexes, AI prompts used for paid services, AI outputs used for commercial search, private API datasets, uploads, and operational logs.

See [DATA_LICENSE.md](./DATA_LICENSE.md).

## Hosted Service

The official hosted ChessView service may include paid features, managed hosting, support, AI search, analytics, integrations, and other commercial services. Those services can use the AGPL core while keeping production data, commercial datasets, private infrastructure, and proprietary service layers reserved.

Forks may run the AGPL software, but they must not present themselves as the official ChessView service or use reserved ChessView marks without permission.

## Local Discovery Workspaces

Local discovery and review workspaces such as `Codex News/` and `Codex Tournaments/` are proprietary operational workspaces. They are intentionally ignored by Git and should not be committed to the public repository.

## Contributors

Contributions are welcome. By contributing, you agree that your contribution can be distributed under the AGPL-3.0-only license. Do not submit code, text, data, assets, or credentials that you do not have the right to contribute.

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Legal Review

This policy is an engineering and project-governance baseline. Before a public commercial launch, ChessView should have a qualified lawyer review the license notices, trademark policy, terms, privacy policy, contributor process, and data restrictions.
