# Prompt: Approve News JSON

Use this prompt only after dedupe and editorial review.

## Inputs

- Candidate JSON file
- Dedupe decision
- Evidence references
- Reviewer identity

## Task

Create an approved news JSON file that follows:

```text
schemas/approved-news.schema.json
```

## Required Behavior

- Keep all factual candidate fields.
- Add `approvedAt`.
- Add `approvedBy`.
- Set `publishStatus` to `ready`.
- Preserve source attribution and evidence refs.
- Keep the summary short and original.
- Do not call backend APIs.
- Do not import or publish automatically.

## Output Path

```text
approved/YYYY-MM-DD/YYYY-MM-DD__source-slug__news-slug.json
```

Publishing is a separate action outside this workspace.

