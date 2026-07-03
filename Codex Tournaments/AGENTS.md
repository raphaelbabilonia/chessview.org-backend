# Codex Tournaments Agent Rules

These rules apply to everything inside `Codex Tournaments/`.

## Non-Negotiables

- Do not write to backend runtime code from this folder.
- Do not call backend write APIs directly from discovery or normalization work.
- Publishing is allowed only through the dedicated local publisher
  `npm run agent:publish`, which calls private agent ingest endpoints with gate
  checks.
- Do not create an automatic publishing loop.
- Do not store credentials, cookies, private user data, or session tokens.
- Do not copy full PDFs, full regulations, full standings, full rankings, or
  protected articles.
- Do store source URLs, timestamps, short evidence excerpts, and attribution.
- Do respect robots.txt, terms of use, rate limits, and source-specific policy.
- Do prefer official source pages, APIs, or partnerships over third-party
  aggregators when available.
- Do not treat benchmark sites as primary sources unless no original source can
  be identified and the item is flagged for manual review.

## Scope

This workspace currently handles tournaments only. News can be added later with
separate schemas, prompts, and state files.

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
   - URL
   - captured timestamp
   - short factual excerpt
   - notes about uncertainty
5. Create candidates:
   - `candidates/YYYY-MM-DD__source-slug__normalized-title.json`
6. Update state:
   - seen URLs
   - dedupe fingerprints
   - source health
   - last run timestamp
7. Approve only after review:
   - `approved/YYYY-MM-DD/YYYY-MM-DD__source-slug__normalized-title.json`

## Candidate Naming

Use:

```text
YYYY-MM-DD__source-slug__normalized-title.json
```

Keep file names lower-case, ASCII, and URL-safe. Use hyphens for spaces.

## Evidence Rules

Evidence should be enough to audit the decision, not enough to recreate the
source page. Store:

- Source URL
- Capture time
- Short factual excerpt
- Any ambiguity or quality note

Avoid storing long copied text. Link back to the source instead.

## Dedupe Rules

Before creating or approving a candidate, check:

- Exact `sourceUrl`
- `originalId`
- Normalized title
- Start date
- City
- Country
- Similar known rejected fingerprints

If an event appears on multiple sources, prefer the most authoritative source
and keep secondary URLs in `externalLinks`.

## Approval Rules

Only approved JSON files may be considered ready for publishing. Approval does
not bypass the local publisher gates.

Approved files must include:

- `approvedAt`
- `approvedBy`
- `publishStatus: "ready"`
- Valid source attribution
- A stable `dedupeKey`
