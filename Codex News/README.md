# Codex News Agentic Workspace

This folder is the operational memory for supervised chess news discovery.
It is not part of the Express backend runtime. Discovery and normalization
agents must not publish directly; only the dedicated local publisher may send
approved JSON to the private agent ingest API.

The goal is to let Codex or a future scheduled agent find chess news leads,
save lightweight evidence, generate short original summaries, deduplicate the
same story across sources, and produce approved JSON files for a separate
controlled publishing step.

## Core Rule

News ingestion stays separated from discovery. This workspace prepares data;
publishing is allowed only through `npm run agent:publish` after approved JSON
passes the automatic gates.

## Folder Map

- `Priority Sources for Chess News Aggregator.md`: human-readable source
  strategy and priority list.
- `AGENTS.md`: operating rules for future agents working in this folder.
- `sources/`: structured source registry and copyright/quality policy.
- `runs/YYYY-MM-DD/HHmm-source/`: historical work log for each agent run.
- `candidates/`: normalized news JSON that is not approved yet.
- `approved/YYYY-MM-DD/`: reviewed news JSON ready for private publishing.
- `rejected/`: rejected or ignored stories with reasons and fingerprints.
- `state/`: dedupe index, seen URLs, source health, and last-run memory.
- `schemas/`: JSON Schema contracts for files produced here.
- `prompts/`: reusable prompts for discovery, normalization, dedupe, approval.
- `reports/`: daily or weekly editorial summaries.
- `examples/`: valid example files for future agents and validators.

## Five Phase Workflow

1. Discover
   - Pick a source from `sources/priority-sources.json`.
   - Check `state/source-health.json`, `state/last-runs.json`, and
     `state/seen-urls.json` before reviewing anything.
   - Create a run folder named `runs/YYYY-MM-DD/HHmm-source-slug/`.

2. Evidence
   - Store source URLs, canonical URLs, timestamps, short factual excerpts, and
     notes in the run folder.
   - Do not store full articles, full interviews, full analysis, full PGN
     collections, private data, paywalled text, credentials, cookies, or
     protected source material.
   - Keep evidence short enough to audit the decision, not to replace the
     original article.

3. Normalize
   - Create one candidate JSON file per story in `candidates/`.
   - Follow `schemas/news-candidate.schema.json`.
   - Summaries must be generated in original wording from facts, not copied.
   - Use `qualityFlags` whenever facts are missing, disputed, or uncertain.

4. Deduplicate and Quality Review
   - Compare against `state/dedupe-index.json` and `state/seen-urls.json`.
   - Check canonical URL, source URL, content hash, normalized title,
     publication date, related players, related tournaments, and story topic.
   - Reject weak, duplicate, paywalled, unsafe, or unverified items into
     `rejected/` with a reason.

5. Approve
   - Copy or move only reviewed items into `approved/YYYY-MM-DD/`.
   - Follow `schemas/approved-news.schema.json`.
   - Set `publishStatus` to `ready`.
   - Publishing is performed only by the local private publisher, not by source
     discovery code.

## Candidate File Contract

A candidate represents a news item that may become public after editorial
review. It contains source attribution, a short generated summary, entities,
category, confidence, evidence references, and a dedupe key.

Required fields include:

- `title`
- `slug`
- `summary`
- `sourceName`
- `sourceUrl`
- `canonicalUrl`
- `language`
- `category`
- `confidence`
- `qualityFlags`
- `evidenceRefs`
- `dedupeKey`
- `lastCheckedAt`

Optional fields include `author`, `publishedAt`, `updatedAt`, `region`,
`imageUrl`, `tags`, `relatedTournamentId`, `relatedTournamentName`,
`relatedPlayerIds`, `relatedPlayerNames`, `originalId`, and `contentHash`.

## Dedupe Key

Use a stable, lower-case key:

```text
published-date-or-unknown|normalized-title
```

If a canonical URL is available, also record it in `state/dedupe-index.json`.
If multiple sources cover the same story, keep the strongest source as primary
and store related coverage in `relatedCoverage`.

## Quality Gates

A news item should only reach `approved/` when:

- The source URL and canonical URL are present.
- The story has a clear source and attribution.
- The summary is short, original, and not copied from the article.
- Paywalled or restricted content is not republished.
- The publication date is clear or explicitly flagged.
- The item is not a known duplicate or rejected fingerprint.
- Discovery-only sources are verified against a primary source.
- Missing or uncertain facts are marked with `qualityFlags`.

## Future Automation

A future hourly automation may use this folder as memory and storage. It should:

1. Read `sources/priority-sources.json`.
2. Pick a source due for review based on `state/last-runs.json`.
3. Create a timestamped run folder.
4. Save lightweight evidence and normalized candidates.
5. Update state files.
6. Run the local private publisher in dry-run mode, then publish only if gates pass.

It must not operate as a blind deterministic scraper, article copier, or direct
database writer.
