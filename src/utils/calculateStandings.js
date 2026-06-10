const getPlayerId = (player) => String(player?._id || player?.id || player || "");

const formatScore = (score) => {
  if (score === 1) return "1";
  if (score === 0.5) return "1/2";
  if (score === 0) return "0";
  return "";
};

const addScore = (entry, score, marker) => {
  entry.points += score;
  entry.played += marker === "bye" ? 0 : 1;
  if (marker === "win") entry.wins += 1;
  if (marker === "draw") entry.draws += 1;
  if (marker === "loss") entry.losses += 1;
  if (marker === "bye") entry.byes += 1;
  if (marker === "forfeit") entry.forfeits += 1;
  entry.roundScores.push(formatScore(score));
};

const calculateStandings = (players = [], pairings = []) => {
  const table = new Map();

  players.forEach((player) => {
    const id = getPlayerId(player);
    table.set(id, {
      player,
      playerId: id,
      firstName: player.firstName || "",
      lastName: player.lastName || "",
      rating: Number(player.rating || 0),
      points: 0,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      byes: 0,
      forfeits: 0,
      roundScores: [],
      scoreString: ""
    });
  });

  pairings.forEach((pairing) => {
    const whiteId = getPlayerId(pairing.whitePlayer);
    const blackId = getPlayerId(pairing.blackPlayer);
    const white = table.get(whiteId);
    const black = table.get(blackId);

    switch (pairing.result) {
      case "1-0":
        if (white) addScore(white, 1, "win");
        if (black) addScore(black, 0, "loss");
        break;
      case "0-1":
        if (white) addScore(white, 0, "loss");
        if (black) addScore(black, 1, "win");
        break;
      case "1/2-1/2":
        if (white) addScore(white, 0.5, "draw");
        if (black) addScore(black, 0.5, "draw");
        break;
      case "bye-white":
        if (white) addScore(white, 1, "bye");
        break;
      case "bye-black":
        if (black) addScore(black, 1, "bye");
        break;
      case "forfeit-white":
        if (white) addScore(white, 0, "forfeit");
        if (black) addScore(black, 1, "win");
        break;
      case "forfeit-black":
        if (white) addScore(white, 1, "win");
        if (black) addScore(black, 0, "forfeit");
        break;
      default:
        break;
    }
  });

  return Array.from(table.values())
    .map((entry) => ({
      ...entry,
      points: Number(entry.points.toFixed(1)),
      scoreString: entry.roundScores.join(" ")
    }))
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.rating !== a.rating) return b.rating - a.rating;
      return a.lastName.localeCompare(b.lastName);
    })
    .map((entry, index) => ({
      position: index + 1,
      ...entry
    }));
};

module.exports = calculateStandings;
