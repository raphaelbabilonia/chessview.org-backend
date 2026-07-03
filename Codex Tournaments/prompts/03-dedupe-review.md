# Prompt: Deduplicate and Review Candidate

Use this prompt before approval.

## Inputs

- Candidate JSON file
- `state/dedupe-index.json`
- `state/seen-urls.json`
- Existing files in `approved/`
- Existing files in `rejected/`

## Task

Decide whether the candidate is new, duplicate, unsafe, or needs manual review.

## Checks

- Exact `sourceUrl` match
- `originalId` match
- Same normalized title, start date, city, and country
- Similar title with same date and country
- Previously rejected fingerprint
- Benchmark-only source without original attribution
- Low-confidence source evidence

## Output

Return one of:

- `approve_ready`: candidate can move to approval.
- `duplicate`: reject or merge into an existing item.
- `needs_review`: keep in `candidates/` with flags.
- `reject`: write a rejection record with reason.

Update state files only after the decision is clear.

