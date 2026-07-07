const syntheticTestEventClauses = () => [
  { "source.name": "ChessView Local Test Data" },
  { "source.originalId": /^local-density-\d+$/i },
  { "source.url": /\/local-test\/tournaments\//i },
  { dedupeKey: /(^|\|)local-density-\d+$/i },
  { websiteUrl: /\/local-test\/tournaments\//i },
  { "metadata.sourceAudit.extractionStatus": "local-test-data" },
  { "metadata.summary": /not production source data/i },
  { title: /^ChessView Local Density Test\b/i }
];

const syntheticTestEventQuery = () => ({ $or: syntheticTestEventClauses() });

const excludeSyntheticTestEventsQuery = () => ({ $nor: syntheticTestEventClauses() });

const isSyntheticTestEvent = (event = {}) => {
  const source = event.source || {};
  const metadata = event.metadata || {};
  const sourceAudit = metadata.sourceAudit || {};
  const sourceName = source.name || event.sourceName || "";
  const originalId = source.originalId || event.originalId || "";
  const sourceUrl = source.url || event.sourceUrl || "";
  const testUrls = [event.websiteUrl, event.sourceUrl, source.url].filter(Boolean).join(" ");
  const metadataSummary = metadata.summary || "";

  return (
    sourceName === "ChessView Local Test Data" ||
    /^local-density-\d+$/i.test(originalId || "") ||
    /(^|\|)local-density-\d+$/i.test(event.dedupeKey || "") ||
    /\/local-test\/tournaments\//i.test(testUrls) ||
    sourceAudit.extractionStatus === "local-test-data" ||
    /not production source data/i.test(metadataSummary) ||
    event.approvedBy === "codex-local-map-density-fixture" ||
    /\/local-test\/tournaments\//i.test(sourceUrl) ||
    /^ChessView Local Density Test\b/i.test(event.title || "")
  );
};

module.exports = {
  excludeSyntheticTestEventsQuery,
  isSyntheticTestEvent,
  syntheticTestEventQuery
};
