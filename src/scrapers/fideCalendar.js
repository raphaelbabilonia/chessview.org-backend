const cheerio = require("cheerio");
const { fetchFormJson } = require("./httpClient");
const { addMonths, compactText, isoDateOnly, parseAddress, stripHtml } = require("./tournamentUtils");

const SOURCE_NAME = "FIDE Calendar";
const DEFAULT_ENDPOINT = "https://calendar.fide.com/calendar_edit.php";
const DEFAULT_PUBLIC_URL = "https://calendar.fide.com/calendar.php";

const eventLinksFromFeature = (feature) => {
  const html = feature?.properties?.events_list || "";
  const $ = cheerio.load(`<main>${html}</main>`);
  return $("a")
    .map((_, element) => {
      const href = $(element).attr("href") || "";
      const title = stripHtml($(element).text());
      const url = new URL(href, DEFAULT_PUBLIC_URL).toString();
      const id = new URL(url).searchParams.get("id") || href;
      return { id, title, url };
    })
    .get()
    .filter((event) => event.title && event.url);
};

const mapFideFeatureEvent = (
  feature,
  event,
  {
    allowDateWindowFallback = false,
    checkedAt = new Date(),
    countryName = "Italy",
    fromDate,
    toDate
  } = {}
) => {
  if (!allowDateWindowFallback) {
    return {
      skipped: true,
      reason: "FIDE Calendar map endpoint did not expose exact event dates.",
      title: event.title,
      sourceUrl: event.url
    };
  }

  const address = parseAddress(feature?.properties?.description, {
    defaultCity: feature?.properties?.venue_name || "Online",
    defaultCountry: countryName
  });

  return {
    title: event.title,
    description: compactText(`${event.title} - ${feature?.properties?.description || ""}`),
    city: address.city,
    country: countryName || address.country,
    venue: feature?.properties?.venue_name || address.venue,
    address: address.address,
    startDate: new Date(fromDate).toISOString(),
    endDate: new Date(toDate || fromDate).toISOString(),
    timeControl: "",
    ratingType: "FIDE",
    sourceName: SOURCE_NAME,
    sourceUrl: event.url,
    registrationUrl: event.url,
    originalId: `fide-calendar:event:${event.id}`,
    lastCheckedAt: checkedAt.toISOString()
  };
};

const searchFideCalendar = async ({
  allowDateWindowFallback = false,
  country = "it",
  countryName = "Italy",
  endpoint = DEFAULT_ENDPOINT,
  fromDate = isoDateOnly(new Date()),
  limit = 25,
  monthsAhead = 12,
  rateLimitMs = 1500,
  respectRobots = true,
  timeoutMs = 20000,
  toDate,
  userAgent
} = {}) => {
  const checkedAt = new Date();
  const resolvedFrom = fromDate || isoDateOnly(checkedAt);
  const resolvedTo = toDate || isoDateOnly(addMonths(checkedAt, monthsAhead));

  const payload = await fetchFormJson(
    endpoint,
    {
      command: "venues",
      all: 0,
      country,
      name_filter: "",
      event_type: "",
      time_control: "",
      from_date: resolvedFrom,
      to_date: resolvedTo
    },
    {
      rateLimitMs,
      respectRobots,
      timeoutMs,
      userAgent
    }
  );

  const features = Array.isArray(payload?.features) ? payload.features : [];
  const max = Math.max(Number(limit || 25), 1);
  const mapped = [];

  for (const feature of features) {
    for (const event of eventLinksFromFeature(feature)) {
      mapped.push(
        mapFideFeatureEvent(feature, event, {
          allowDateWindowFallback,
          checkedAt,
          countryName,
          fromDate: resolvedFrom,
          toDate: resolvedTo
        })
      );
    }
  }

  const tournaments = mapped
    .filter((item) => !item.skipped)
    .filter((tournament) => tournament.title && tournament.startDate && tournament.sourceUrl)
    .slice(0, max);
  const skipped = mapped.filter((item) => item.skipped).slice(0, max);

  return {
    sourceName: SOURCE_NAME,
    sourceUrl: `${DEFAULT_PUBLIC_URL}?country=${encodeURIComponent(country)}`,
    tournaments,
    skipped,
    warnings: skipped.length
      ? [`Skipped ${skipped.length} FIDE Calendar events because exact dates were not exposed by the map endpoint.`]
      : []
  };
};

module.exports = {
  DEFAULT_ENDPOINT,
  SOURCE_NAME,
  eventLinksFromFeature,
  mapFideFeatureEvent,
  searchFideCalendar
};
