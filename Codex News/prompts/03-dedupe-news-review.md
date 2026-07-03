# Prompt: Deduplicate and Review News Candidate

Use this prompt before approval.

## Inputs

- Candidate JSON file
- `state/dedupe-index.json`
- `state/seen-urls.json`
- Existing files in `approved/`
- Existing files in `rejected/`

## Task

Decide whether the candidate is a new story, the same story as an existing
item, a related story, unsafe, or needs manual review.

## Checks

- Exact `canonicalUrl` match
- Exact `sourceUrl` match
- `originalId` match
- `contentHash` match
- Normalized title similarity
- Publication date window
- Same players mentioned
- Same tournament mentioned
- Same official announcement
- Discovery-only source without primary verification
- Paywalled or restricted source
- Previously rejected fingerprint

## Output

Return one of:

- `approve_ready`: candidate can move to approval.
- `same_story`: reject or merge into an existing item.
- `related_story`: keep as related coverage or separate if editorially useful.
- `needs_review`: keep in `candidates/` with flags.
- `reject`: write a rejection record with reason.

Update state files only after the decision is clear.

