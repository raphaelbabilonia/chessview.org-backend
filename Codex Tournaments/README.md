# Codex Tournaments Agentic Workspace

This folder is the operational memory for supervised tournament discovery.
It is not part of the Express backend runtime. Discovery and normalization
agents must not publish directly; only the dedicated local publisher may send
approved JSON to the private agent ingest API.

The goal is to let Codex or a future scheduled agent collect lightweight
evidence, normalize tournament candidates, deduplicate them, and produce clean
approved JSON files for a controlled publishing step.

## Core Rule

Backend ingestion stays separated from discovery. This workspace prepares data;
publishing is allowed only through `npm run agent:publish` after approved JSON
passes the automatic gates.

## Folder Map

- `Priority Sources for Chess Tournament Aggregator.md`: human-readable source
  strategy and priority list.
- `AGENTS.md`: operating rules for every future agent working in this folder.
- `sources/`: structured source registry and legal/quality policy.
- `runs/YYYY-MM-DD/HHmm-source/`: historical work log for each agent run.
- `candidates/`: normalized tournament JSON that is not approved yet.
- `approved/YYYY-MM-DD/`: reviewed tournament JSON ready for private publishing.
- `rejected/`: rejected or ignored items with reasons and fingerprints.
- `state/`: dedupe index, seen URLs, source health, and last-run memory.
- `schemas/`: JSON Schema contracts for files produced here.
- `prompts/`: reusable prompts for discovery, normalization, dedupe, approval.
- `reports/`: daily or weekly summaries.
- `examples/`: valid example files for future agents and validators.

## Five Phase Workflow

1. Discover
   - Pick a source from `sources/priority-sources.json`.
   - Check `state/source-health.json`, `state/last-runs.json`, and
     `state/seen-urls.json` before visiting anything.
   - Create a run folder named `runs/YYYY-MM-DD/HHmm-source-slug/`.

2. Evidence
   - Store URLs, timestamps, short excerpts, and notes in the run folder.
   - Do not copy complete PDFs, full regulations, full ranking tables, private
     data, credentials, cookies, or protected text.
   - Always keep attribution through `sourceName` and `sourceUrl`.

3. Normalize
   - Create one candidate JSON file per tournament in `candidates/`.
   - Follow `schemas/tournament-candidate.schema.json`.
   - Use `qualityFlags` whenever important fields are missing or uncertain.

4. Deduplicate and Quality Review
   - Compare against `state/dedupe-index.json` and `state/seen-urls.json`.
   - Check URL, external ID, normalized title, start date, city, and country.
   - Reject weak, duplicate, or unsafe items into `rejected/` with a reason.

5. Approve
   - Copy or move only reviewed items into `approved/YYYY-MM-DD/`.
   - Follow `schemas/approved-tournament.schema.json`.
   - Set `publishStatus` to `ready`.
   - Publishing is performed only by the local private publisher, not by source
     discovery code.

## Candidate File Contract

A candidate represents a tournament that may become public after review. It
contains core event fields, source attribution, confidence, evidence references,
and a dedupe key.

Required fields include:

- `title`
- `startDate`
- `country`
- `sourceName`
- `sourceUrl`
- `confidence`
- `qualityFlags`
- `evidenceRefs`
- `dedupeKey`
- `lastCheckedAt`

Optional fields include `endDate`, `city`, `venue`, `timeControl`,
`ratingType`, `websiteUrl`, `registrationUrl`, `resultsUrl`,
`regulationsUrl`, `externalLinks`, and `originalId`.

## Dedupe Key

Use a stable, lower-case key:

```text
country|city|startDate|normalized-title
```

If the city is unknown, use `unknown-city`. If a source has a stable external
ID, also record it in `state/dedupe-index.json`.

## Quality Gates

A tournament should only reach `approved/` when:

- The source URL is present and attributable.
- The start date is clear.
- The country is clear.
- The title is not copied from protected text beyond what is necessary for
  factual identification.
- The item is not a known duplicate or rejected fingerprint.
- Missing fields are explicitly marked with `qualityFlags`.

## Future Automation

A future hourly automation may use this folder as memory and storage. It should:

1. Read `sources/priority-sources.json`.
2. Pick a source due for review based on `state/last-runs.json`.
3. Create a timestamped run folder.
4. Save evidence and candidates.
5. Update state files.
6. Run the local private publisher in dry-run mode, then publish only if gates pass.

It must not operate as a blind deterministic scraper or direct database writer.
