const inferRatingType = (value) => {
  const text = String(value || "").toLowerCase();
  if (/\bfide\b/.test(text)) return "FIDE";
  if (/\b(uscf|us chess|nwsrs|national)\b/.test(text)) return "national";
  if (/\bunrated\b/.test(text)) return "unrated";
  return "";
};

const classifyBaseMinutes = (minutes) => {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value <= 0) return "";
  if (value <= 14) return "blitz";
  if (value <= 59) return "rapid";
  return "standard";
};

const inferMinutesFromText = (text) => {
  const minuteMatch = text.match(/\b(\d{1,3})\s*(?:minutes?|mins?|min)\b/i);
  if (minuteMatch) return classifyBaseMinutes(minuteMatch[1]);

  const gameMatch = text.match(/\bg\/?\s*(\d{1,3})\b/i);
  if (gameMatch) return classifyBaseMinutes(gameMatch[1]);

  const incrementMatch = text.match(/\b(\d{1,3})\s*\+\s*\d{1,2}\b/);
  if (incrementMatch) return classifyBaseMinutes(incrementMatch[1]);

  const apostropheMatch = text.match(/\b(\d{1,3})'\s*\+\s*\d{1,2}''/);
  if (apostropheMatch) return classifyBaseMinutes(apostropheMatch[1]);

  return "";
};

const inferTimeControl = (value) => {
  const text = String(value || "").toLowerCase();
  if (/\b(?:mixed|rapid\s*(?:\/|&|and)\s*blitz|blitz\s*(?:\/|&|and)\s*rapid)\b/.test(text)) return "mixed";
  if (text.includes("blitz")) return "blitz";
  if (text.includes("rapid")) return "rapid";
  if (text.includes("classical") || text.includes("standard")) return "standard";
  return inferMinutesFromText(text);
};

module.exports = {
  inferRatingType,
  inferTimeControl
};
