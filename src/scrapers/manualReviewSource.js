const searchManualReviewSource = async ({ reason = "This source requires a dedicated adapter or partnership.", sourceName, sourceUrl }) => ({
  sourceName,
  sourceUrl,
  tournaments: [],
  warnings: [reason]
});

module.exports = {
  searchManualReviewSource
};
