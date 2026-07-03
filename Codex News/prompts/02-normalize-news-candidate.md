# Prompt: Normalize News Candidate

Use this prompt after discovery finds a news item worth reviewing.

## Inputs

- Source URL
- Canonical URL, if available
- Source name
- Run folder path
- Evidence notes
- Existing `state/dedupe-index.json`

## Task

Produce one normalized news candidate JSON file that follows:

```text
schemas/news-candidate.schema.json
```

## Required Behavior

- Extract only factual metadata needed for Chess View.
- Preserve `sourceUrl` and `canonicalUrl`.
- Generate a short original summary in your own words.
- Do not copy article paragraphs.
- Use `relatedCoverage` for secondary URLs covering the same story.
- Add `qualityFlags` for missing or uncertain information.
- Add `paywall_detected` if content appears restricted.
- Add `discovery_only_source` when the source is not suitable as primary
  attribution.
- Add at least one `evidenceRefs` item.
- Build `dedupeKey` as:

```text
published-date-or-unknown|normalized-title
```

## Output Path

```text
candidates/YYYY-MM-DD__source-slug__news-slug.json
```

Do not place the file in `approved/` during this step.

