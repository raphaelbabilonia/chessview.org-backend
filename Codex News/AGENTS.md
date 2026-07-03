# Codex News Agent Rules

These rules apply to everything inside `Codex News/`.

## Non-Negotiables

- Do not write to backend runtime code from this folder.
- Do not call backend write APIs directly from discovery or normalization work.
- Publishing is allowed only through the dedicated local publisher
  `npm run agent:publish`, which calls private agent ingest endpoints with gate
  checks.
- Do not create an automatic publishing loop.
- Do not store credentials, cookies, private user data, session tokens, or
  private account output.
- Do not copy full articles, full interviews, full game annotations, full PGN
  collections, full transcripts, or long excerpts.
- Do not republish paywalled or restricted content.
- Do store source URLs, canonical URLs, timestamps, short evidence excerpts,
  attribution, uncertainty notes, and source quality notes.
- Do respect robots.txt, terms of use, copyright rules, rate limits, and
  source-specific policy.
- Do prefer RSS feeds, APIs, sitemaps, or partnerships when clearly available.
- Do not treat discovery sources such as social media, Reddit, Google News, or
  mainstream search results as primary attribution unless the item is explicitly
  flagged for manual review.

## Scope

This workspace currently handles chess news only. Tournaments live in
`../Codex Tournaments/`.

## Standard Run Procedure

1. Read:
   - `sources/priority-sources.json`
   - `sources/source-policy.md`
   - `state/dedupe-index.json`
   - `state/seen-urls.json`
   - `state/source-health.json`
   - `state/last-runs.json`
2. Create a folder:
   - `runs/YYYY-MM-DD/HHmm-source-slug/`
3. Save run metadata:
   - `run-manifest.json`
4. Save lightweight evidence:
   - source URL
   - canonical URL, when available
   - capture time
   - short factual excerpt
   - notes about uncertainty, paywall, rights, or source quality
5. Create candidates:
   - `candidates/YYYY-MM-DD__source-slug__news-slug.json`
6. Update state:
   - seen URLs
   - dedupe fingerprints
   - source health
   - last run timestamp
7. Approve only after review:
   - `approved/YYYY-MM-DD/YYYY-MM-DD__source-slug__news-slug.json`

## Candidate Naming

Use:

```text
YYYY-MM-DD__source-slug__news-slug.json
```

Keep file names lower-case, ASCII, and URL-safe. Use hyphens for spaces.

## Summary Rules

Summaries must be original generated text based on facts. They must not copy
article paragraphs. Keep summaries short:

- One to four sentences.
- No long quotations.
- No full analysis recreation.
- No paywalled details beyond factual public metadata.
- Link users to the original article for the full story.

## Evidence Rules

Evidence should be enough to audit the decision, not enough to recreate the
source article. Store:

- Source URL
- Canonical URL
- Capture time
- Short factual excerpt
- Any ambiguity or quality note

Avoid storing long copied text. Link back to the source instead.

## Dedupe Rules

Before creating or approving a candidate, check:

- Exact `canonicalUrl`
- Exact `sourceUrl`
- `originalId`
- `contentHash`
- Normalized title
- Publication date
- Related players
- Related tournament
- Same story from another publisher
- Previously rejected fingerprint

If several outlets cover the same story, prefer the most authoritative or
original source and keep secondary articles in `relatedCoverage`.

## Approval Rules

Only approved JSON files may be considered ready for publishing. Approval does
not bypass the local publisher gates.

Approved files must include:

- `approvedAt`
- `approvedBy`
- `publishStatus: "ready"`
- Valid source attribution
- A stable `dedupeKey`
- A short original summary
