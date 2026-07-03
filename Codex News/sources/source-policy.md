# News Source Policy

This policy keeps the workspace useful without turning Chess View into an
automatic article scraper or republication system.

## Allowed

- Agent-supervised source review.
- RSS/API/sitemap review when a source clearly allows it.
- Short factual evidence excerpts.
- Original generated summaries.
- Links to original articles, canonical URLs, images, and source pages.
- Dedupe and quality notes.

## Not Allowed

- Automatic backend import without approval.
- Full article copying.
- Long excerpts, copied interviews, copied annotations, copied PGNs, or copied
  transcripts.
- Paywalled or restricted content republication.
- Storing private data, credentials, cookies, or session output.
- Treating discovery sources as primary sources without verification.
- Publishing low-confidence candidates without flags.

## Source Priority

Primary sources are preferred in this order:

1. Official federation, platform, player, organizer, or event source.
2. Original reporting by established chess media.
3. RSS/API/sitemap source that links to original canonical articles.
4. Mainstream media for major public stories.
5. Discovery-only sources, only after verification elsewhere.

## Required Attribution

Every candidate must include:

- `sourceName`
- `sourceUrl`
- `canonicalUrl`
- `lastCheckedAt`
- At least one `evidenceRefs` item

## Quality Flags

Use `qualityFlags` to preserve uncertainty instead of hiding it. Common flags:

- `missing_author`
- `missing_published_at`
- `date_uncertain`
- `category_uncertain`
- `region_uncertain`
- `language_uncertain`
- `image_rights_uncertain`
- `paywall_detected`
- `duplicate_possible`
- `related_story_possible`
- `source_requires_manual_check`
- `discovery_only_source`
- `primary_source_missing`
- `legal_review_required`
- `low_confidence`
- `summary_needs_review`
- `stale_source`

