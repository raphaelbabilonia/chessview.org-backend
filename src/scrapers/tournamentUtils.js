const cheerio = require("cheerio");

const stripHtml = (value) => {
  const $ = cheerio.load(`<main>${value || ""}</main>`);
  return $("main")
    .text()
    .replace(/\s+/g, " ")
    .trim();
};

const compactText = (value, maxLength = 220) => {
  const text = stripHtml(value);
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}...` : text;
};

const inferRatingType = (value) => {
  const text = String(value || "").toLowerCase();
  if (/\bfide\b/.test(text)) return "FIDE";
  if (/\b(uscf|us chess|nwsrs)\b/.test(text)) return "national";
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

  const gMatch = text.match(/\bg\/?\s*(\d{1,3})\b/i);
  if (gMatch) return classifyBaseMinutes(gMatch[1]);

  const incrementMatch = text.match(/\b(\d{1,3})\s*\+\s*\d{1,2}\b/);
  if (incrementMatch) return classifyBaseMinutes(incrementMatch[1]);

  const apostropheMatch = text.match(/\b(\d{1,3})'\s*\+\s*\d{1,2}''/);
  if (apostropheMatch) return classifyBaseMinutes(apostropheMatch[1]);

  return "";
};

const inferTimeControl = (value) => {
  const text = String(value || "").toLowerCase();
  if (text.includes("blitz")) return "blitz";
  if (text.includes("rapid")) return "rapid";
  if (text.includes("classical") || text.includes("standard")) return "standard";
  const inferredFromMinutes = inferMinutesFromText(text);
  if (inferredFromMinutes) return inferredFromMinutes;
  return "";
};

const parseAddress = (address, { defaultCity = "Online", defaultCountry = "Global" } = {}) => {
  const clean = stripHtml(address);
  if (!clean) return { city: defaultCity, country: defaultCountry, venue: "", address: "" };

  const parts = clean.split(",").map((part) => part.trim()).filter(Boolean);
  const last = parts[parts.length - 1] || "";
  const country =
    {
      usa: "United States",
      "united states": "United States",
      italy: "Italy",
      italia: "Italy"
    }[last.toLowerCase()] || defaultCountry;

  const city =
    parts.length >= 3
      ? parts[parts.length - 3]
      : parts.length >= 2
        ? parts[parts.length - 2]
        : parts[0] || defaultCity;

  return {
    city,
    country,
    venue: clean,
    address: clean
  };
};

const isoDateOnly = (value) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
};

const toIsoDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
};

const monthNumbers = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12
};

const dateFromParts = (year, month, day) => {
  const resolvedYear = Number(year);
  const resolvedMonth = Number(month);
  const resolvedDay = Number(day);
  if (!resolvedYear || !resolvedMonth || !resolvedDay) return "";
  const date = new Date(Date.UTC(resolvedYear, resolvedMonth - 1, resolvedDay, 12, 0, 0));
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
};

const parseIsoDateRange = (value) => {
  const text = String(value || "");
  const match = text.match(/(\d{4}-\d{2}-\d{2})(?:\s*(?:to|\/|-|–|—)\s*(\d{4}-\d{2}-\d{2}))?/i);
  if (!match) return { startDate: "", endDate: "" };
  return {
    startDate: toIsoDate(match[1]),
    endDate: toIsoDate(match[2] || match[1])
  };
};

const parseEnglishDateRange = (value) => {
  const text = String(value || "").replace(/(\d+)(st|nd|rd|th)/gi, "$1");

  let match = text.match(
    /from\s+(\d{1,2})\s+to\s+(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})/i
  );
  if (match) {
    const month = monthNumbers[match[3].toLowerCase()];
    return {
      startDate: dateFromParts(match[4], month, match[1]),
      endDate: dateFromParts(match[4], month, match[2])
    };
  }

  match = text.match(/from\s+(\d{1,2})\s+([A-Za-z]+)\s+to\s+(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})/i);
  if (match) {
    return {
      startDate: dateFromParts(match[5], monthNumbers[match[2].toLowerCase()], match[1]),
      endDate: dateFromParts(match[5], monthNumbers[match[4].toLowerCase()], match[3])
    };
  }

  match = text.match(/(\d{1,2})\s+([A-Za-z]+)\s*(?:-|–|—|to)\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i);
  if (match) {
    return {
      startDate: dateFromParts(match[5], monthNumbers[match[2].toLowerCase()], match[1]),
      endDate: dateFromParts(match[5], monthNumbers[match[4].toLowerCase()], match[3])
    };
  }

  match = text.match(/(\d{1,2})\s+to\s+(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})/i);
  if (match) {
    const month = monthNumbers[match[3].toLowerCase()];
    return {
      startDate: dateFromParts(match[4], month, match[1]),
      endDate: dateFromParts(match[4], month, match[2])
    };
  }

  return { startDate: "", endDate: "" };
};

const addMonths = (date, months) => {
  const result = new Date(date);
  result.setMonth(result.getMonth() + Number(months || 0));
  return result;
};

module.exports = {
  addMonths,
  compactText,
  inferRatingType,
  inferTimeControl,
  isoDateOnly,
  parseEnglishDateRange,
  parseIsoDateRange,
  parseAddress,
  stripHtml
};
