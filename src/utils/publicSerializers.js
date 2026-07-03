const toPlain = (value) => (value?.toObject ? value.toObject() : value || null);

const publicOrganizer = (organizer) => {
  const value = toPlain(organizer);
  if (!value) return null;
  return {
    _id: value._id,
    name: value.name || ""
  };
};

const publicPlayer = (player) => {
  const value = toPlain(player);
  if (!value) return null;
  return {
    _id: value._id,
    event: value.event,
    section: value.section,
    firstName: value.firstName || "",
    lastName: value.lastName || "",
    federation: value.federation || "",
    club: value.club || "",
    rating: value.rating || 0,
    fideId: value.fideId || "",
    title: value.title || "",
    gender: value.gender || "",
    nationalRating: value.nationalRating || 0,
    fideK: value.fideK || 0,
    nationalK: value.nationalK || 0,
    performanceRating: value.performanceRating || 0,
    ratingChange: value.ratingChange ?? null,
    sourceRank: value.sourceRank || 0,
    sourcePoints: value.sourcePoints || 0,
    sourceRankedId: value.sourceRankedId || 0,
    sourceTieBreaks: value.sourceTieBreaks || [],
    sourceMatches: value.sourceMatches || [],
    status: value.status || "active",
    source: value.source || {},
    createdAt: value.createdAt,
    updatedAt: value.updatedAt
  };
};

module.exports = {
  publicOrganizer,
  publicPlayer
};
