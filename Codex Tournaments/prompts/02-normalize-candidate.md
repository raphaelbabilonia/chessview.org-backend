# Prompt: Normalize Tournament Candidate

Use this prompt after discovery finds a tournament page worth reviewing.

## Inputs

- Source URL
- Source name
- Run folder path
- Evidence notes
- Existing `state/dedupe-index.json`

## Task

Produce one normalized tournament candidate JSON file that follows:

```text
schemas/tournament-candidate.schema.json
```

## Required Behavior

- Extract only factual metadata needed for Chess View.
- Preserve the original `sourceUrl`.
- Use `externalLinks` for secondary official URLs.
- Use `websiteUrl`, `registrationUrl`, `resultsUrl`, and `regulationsUrl`
  when clearly available.
- Use `unknown` for uncertain `timeControl` or `ratingType`.
- Add `qualityFlags` for missing or uncertain information.
- Add at least one `evidenceRefs` item.
- Build `dedupeKey` as:

```text
country|city-or-unknown-city|startDate|normalized-title
```

## Output Path

```text
candidates/YYYY-MM-DD__source-slug__normalized-title.json
```

Do not place the file in `approved/` during this step.

