# Prompt: Discover News Leads

Use this prompt when an agent starts a news source review run.

## Inputs

- Source object from `sources/priority-sources.json`
- `state/last-runs.json`
- `state/seen-urls.json`
- `state/source-health.json`
- Current date, target region, and target language if any

## Task

Find new or updated chess news pages for the selected source. Focus on recent,
relevant, attributable stories that can be summarized briefly and redirected to
the original source.

## Rules

- Do not call backend write APIs.
- Do not publish or import anything.
- Do not copy full articles, full interviews, annotations, PGN collections, or
  transcripts.
- Do not republish paywalled content.
- Respect robots.txt, terms of use, copyright rules, and rate limits.
- Prefer official and primary sources.
- Use discovery-only sources only to find original sources.
- Skip URLs already present in `state/seen-urls.json` unless there is a clear
  reason to re-check them.

## Output

Create or update a run folder:

```text
runs/YYYY-MM-DD/HHmm-source-slug/
```

Inside the run folder, prepare:

- `run-manifest.json`
- lightweight evidence notes
- a list of candidate URLs worth normalizing
- a short next-step suggestion

