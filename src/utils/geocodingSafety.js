const normalizeCountry = (value) =>
  String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const COUNTRY_CODE_ALIASES = {
  "bosnia and herzegovina": "ba",
  "chinese taipei": "tw",
  "czech republic": "cz",
  england: "gb",
  hongkong: "hk",
  "hong kong china": "hk",
  "ivory coast": "ci",
  kosovo: "xk",
  "north macedonia": "mk",
  "puerto rico": "pr",
  "republic of turkiye": "tr",
  russia: "ru",
  scotland: "gb",
  serbia: "rs",
  turkey: "tr",
  "united kingdom": "gb",
  "united states": "us",
  wales: "gb"
};

// Intl.DisplayNames recognizes retired region codes too. Excluding them
// prevents current countries such as Germany and Serbia mapping to DD or CS.
const RETIRED_REGION_CODES = new Set([
  "AN",
  "BU",
  "CS",
  "DD",
  "FX",
  "NT",
  "SU",
  "TP",
  "YD",
  "YU",
  "ZR"
]);

let countryCodesByName;

const buildCountryCodeIndex = () => {
  if (countryCodesByName) return countryCodesByName;

  countryCodesByName = new Map(Object.entries(COUNTRY_CODE_ALIASES));
  const displayNames = new Intl.DisplayNames(["en"], { type: "region" });

  for (let first = 65; first <= 90; first += 1) {
    for (let second = 65; second <= 90; second += 1) {
      const code = String.fromCharCode(first, second);
      if (RETIRED_REGION_CODES.has(code)) continue;
      const name = displayNames.of(code);
      const normalizedName = normalizeCountry(name);
      if (name && name !== code && !countryCodesByName.has(normalizedName)) {
        countryCodesByName.set(normalizedName, code.toLowerCase());
      }
    }
  }

  return countryCodesByName;
};

const countryCodeFor = (country) => buildCountryCodeIndex().get(normalizeCountry(country)) || "";

const coordinateIsValid = ([longitude, latitude] = []) =>
  Number.isFinite(Number(longitude)) &&
  Number.isFinite(Number(latitude)) &&
  Number(longitude) >= -180 &&
  Number(longitude) <= 180 &&
  Number(latitude) >= -90 &&
  Number(latitude) <= 90;

const geocoderResultMatchesCountry = (result, expectedCountry) => {
  const expectedCode = countryCodeFor(expectedCountry);
  const resultCode = String(result?.address?.country_code || "").trim().toLowerCase();

  if (expectedCode) return Boolean(resultCode) && resultCode === expectedCode;

  const resultCountry = normalizeCountry(result?.address?.country);
  return Boolean(resultCountry) && resultCountry === normalizeCountry(expectedCountry);
};

module.exports = {
  coordinateIsValid,
  countryCodeFor,
  geocoderResultMatchesCountry,
  normalizeCountry
};
