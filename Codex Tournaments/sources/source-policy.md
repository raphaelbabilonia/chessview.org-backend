# Source Policy

This policy keeps the workspace useful without turning the backend into an
automatic scraper.

## Allowed

- Agent-supervised web review.
- API review when a source explicitly offers an API or partnership path.
- Short factual evidence excerpts.
- Links to official registration, result, regulation, and source pages.
- Dedupe and quality notes.

## Not Allowed

- Automatic backend import without approval.
- Bulk copying of regulations, PDFs, player lists, ranking tables, or articles.
- Storing private data, credentials, cookies, or session output.
- Treating competitor aggregators as authoritative when an original source is
  available.
- Publishing low-confidence candidates without flags.

## Source Priority

Primary sources are preferred in this order:

1. Official federation or organizer page.
2. Official tournament platform page.
3. Official ratings calendar.
4. Official broadcast page.
5. Third-party benchmark or aggregator, only for discovery.

## Required Attribution

Every candidate must include:

- `sourceName`
- `sourceUrl`
- `lastCheckedAt`
- At least one `evidenceRefs` item

## Quality Flags

Use `qualityFlags` to preserve uncertainty instead of hiding it. Common flags:

- `missing_city`
- `missing_venue`
- `missing_end_date`
- `date_uncertain`
- `time_control_uncertain`
- `rating_type_uncertain`
- `registration_link_missing`
- `results_link_missing`
- `duplicate_possible`
- `source_requires_manual_check`
- `legal_review_required`
- `benchmark_only`
- `low_confidence`
- `stale_source`

