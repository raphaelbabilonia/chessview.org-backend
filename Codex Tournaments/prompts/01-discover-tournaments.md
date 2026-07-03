# Prompt: Discover Tournament Leads

Use this prompt when an agent starts a source review run.

## Inputs

- Source object from `sources/priority-sources.json`
- `state/last-runs.json`
- `state/seen-urls.json`
- `state/source-health.json`
- Current date and target region, if any

## Task

Find new or updated chess tournament pages for the selected source. Focus on
future or recently updated tournaments that may be relevant for Chess View.

## Rules

- Do not call backend write APIs.
- Do not publish or import anything.
- Do not copy full source pages, PDFs, regulations, standings, rankings, or
  protected text.
- Respect robots.txt, terms of use, and rate limits.
- Prefer official source URLs over benchmark aggregators.
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

