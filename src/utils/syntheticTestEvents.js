const syntheticTestEventClauses = () => [
  { "source.name": "ChessView Local Test Data" },
  { "source.originalId": /^local-density-\d+$/i },
  { dedupeKey: /(^|\|)local-density-\d+$/i },
  { websiteUrl: /\/local-test\/tournaments\//i },
  { title: /^ChessView Local Density Test\b/i }
];

const syntheticTestEventQuery = () => ({ $or: syntheticTestEventClauses() });

const excludeSyntheticTestEventsQuery = () => ({ $nor: syntheticTestEventClauses() });

const isSyntheticTestEvent = (event = {}) => {
  const source = event.source || {};
  return (
    source.name === "ChessView Local Test Data" ||
    /^local-density-\d+$/i.test(source.originalId || "") ||
    /(^|\|)local-density-\d+$/i.test(event.dedupeKey || "") ||
    /\/local-test\/tournaments\//i.test(event.websiteUrl || "") ||
    /^ChessView Local Density Test\b/i.test(event.title || "")
  );
};

module.exports = {
  excludeSyntheticTestEventsQuery,
  isSyntheticTestEvent,
  syntheticTestEventQuery
};
