# Prompt: Approve Tournament JSON

Use this prompt only after dedupe review.

## Inputs

- Candidate JSON file
- Dedupe decision
- Evidence references
- Reviewer identity

## Task

Create an approved tournament JSON file that follows:

```text
schemas/approved-tournament.schema.json
```

## Required Behavior

- Keep all factual candidate fields.
- Add `approvedAt`.
- Add `approvedBy`.
- Set `publishStatus` to `ready`.
- Preserve source attribution and evidence refs.
- Do not call backend APIs.
- Do not import or publish automatically.

## Output Path

```text
approved/YYYY-MM-DD/YYYY-MM-DD__source-slug__normalized-title.json
```

Publishing is a separate action outside this workspace.

