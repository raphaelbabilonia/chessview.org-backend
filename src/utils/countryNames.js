const ALIASES = new Map(Object.entries({
  "u.s.a.": "United States",
  us: "United States",
  usa: "United States",
  "united states of america": "United States",
  "people's republic of china": "China",
  "hong kong": "China",
  hongkong: "China",
  "hong kong, china": "China",
  türkiye: "Turkey",
  "türkiye": "Turkey",
  turkiye: "Turkey",
  "republic of turkiye": "Turkey",
  "republic of turkey": "Turkey",
  korea: "South Korea",
  "republic of korea": "South Korea",
  "czech republic": "Czechia"
}));

const canonicalCountryName = (value) => {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  return ALIASES.get(clean.toLowerCase()) || clean;
};

module.exports = { canonicalCountryName };
