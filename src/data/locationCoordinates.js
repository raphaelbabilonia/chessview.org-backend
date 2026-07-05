const COUNTRY_ALIASES = {
  america: "United States",
  czechia: "Czech Republic",
  "hong kong china": "Hong Kong, China",
  turkiye: "Turkey",
  turkey: "Turkey",
  uk: "United Kingdom",
  us: "United States",
  usa: "United States",
  "united states of america": "United States"
};

const normalizeText = (value) =>
  String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const cleanCountry = (value) => {
  const country = String(value || "").trim();
  if (!country) return "";
  return COUNTRY_ALIASES[normalizeText(country)] || country;
};

const locationRows = [
  ["A Guarda", "Spain", "Galicia", [-8.8744, 41.9013]],
  ["Alacant", "Spain", "Valencian Community", [-0.4907, 38.3452]],
  ["Alicante", "Spain", "Valencian Community", [-0.4907, 38.3452]],
  ["Azkoitia", "Spain", "Basque Country", [-2.311, 43.177]],
  ["Badalona", "Spain", "Catalonia", [2.245, 41.45]],
  ["Bormujos", "Spain", "Andalusia", [-6.0701, 37.3733]],
  ["Bormujos (Sevilla)", "Spain", "Andalusia", [-6.0701, 37.3733]],
  ["Calvia", "Spain", "Balearic Islands", [2.5066, 39.5653]],
  ["Cerceda", "Spain", "Galicia", [-8.4701, 43.1886]],
  ["Chipiona", "Spain", "Andalusia", [-6.432, 36.7366]],
  ["Chipiona, Cadiz", "Spain", "Andalusia", [-6.432, 36.7366]],
  ["Collado Villalba", "Spain", "Community of Madrid", [-4.0067, 40.6266]],
  ["Colunga", "Spain", "Asturias", [-5.2706, 43.4859]],
  ["El Vendrell", "Spain", "Catalonia", [1.5349, 41.2207]],
  ["Ferrol", "Spain", "Galicia", [-8.2333, 43.4832]],
  ["Granada", "Spain", "Andalusia", [-3.5986, 37.1773]],
  ["Ibiza", "Spain", "Balearic Islands", [1.4329, 38.9067]],
  ["Ibiza (Baleares)", "Spain", "Balearic Islands", [1.4329, 38.9067]],
  ["L'Escala", "Spain", "Catalonia", [3.1324, 42.1246]],
  ["La Pobla de Lillet", "Spain", "Catalonia", [1.9748, 42.2444]],
  ["La Pobla de Lillet (Barcelona)", "Spain", "Catalonia", [1.9748, 42.2444]],
  ["La Puerta de Segura", "Spain", "Andalusia", [-2.7396, 38.3522]],
  ["Lanzarote", "Spain", "Canary Islands", [-13.5899, 29.0469]],
  ["Meis", "Spain", "Galicia", [-8.7078, 42.5155]],
  ["O Mosteiro, Meis", "Spain", "Galicia", [-8.7078, 42.5155]],
  ["Padul", "Spain", "Andalusia", [-3.625, 37.0244]],
  ["San Vicente de Raspeig", "Spain", "Valencian Community", [-0.5255, 38.3964]],
  ["Sant Adria de Besos", "Spain", "Catalonia", [2.2232, 41.4306]],
  ["Sant Boi de Llobregat", "Spain", "Catalonia", [2.043, 41.3436]],
  ["Sant Vicent del Raspeig", "Spain", "Valencian Community", [-0.5255, 38.3964]],
  ["Santa Pola", "Spain", "Valencian Community", [-0.5555, 38.1917]],
  ["Sestao", "Spain", "Basque Country", [-2.9896, 43.3098]],
  ["Sestao, Basque Country", "Spain", "Basque Country", [-2.9896, 43.3098]],
  ["Sevilla", "Spain", "Andalusia", [-5.9845, 37.3891]],
  ["Toledo", "Spain", "Castilla-La Mancha", [-4.0273, 39.8628]],
  ["Valencia", "Spain", "Valencian Community", [-0.3763, 39.4699]],
  ["Villanueva de la Reina", "Spain", "Andalusia", [-3.9168, 38.0044]],
  ["Vitoria Gasteiz", "Spain", "Basque Country", [-2.6727, 42.8467]],
  ["Vitoria-Gasteiz", "Spain", "Basque Country", [-2.6727, 42.8467]],
  ["Zaragoza", "Spain", "Aragon", [-0.8891, 41.6488]]
];

const locationByCityAndCountry = new Map();
const locationByCity = new Map();

for (const [city, country, region, coordinates] of locationRows) {
  const item = {
    city,
    country: cleanCountry(country),
    region,
    coordinates
  };
  locationByCityAndCountry.set(`${normalizeText(city)}|${normalizeText(country)}`, item);
  if (!locationByCity.has(normalizeText(city))) {
    locationByCity.set(normalizeText(city), item);
  }
}

const coordinatesFromValue = (value) => {
  if (Array.isArray(value)) {
    const [longitude, latitude] = value.map(Number);
    if (Number.isFinite(longitude) && Number.isFinite(latitude)) return [longitude, latitude];
  }

  if (value && typeof value === "object") {
    const longitude = Number(value.longitude ?? value.lng ?? value.lon);
    const latitude = Number(value.latitude ?? value.lat);
    if (Number.isFinite(longitude) && Number.isFinite(latitude)) return [longitude, latitude];
  }

  return null;
};

const coordinatesFromEvent = (event = {}) => {
  const candidates = [
    event.coordinates,
    event.location?.coordinates,
    event.metadata?.logistics?.coordinates,
    [event.longitude, event.latitude],
    [event.lng, event.lat],
    [event.location?.longitude, event.location?.latitude],
    [event.location?.lng, event.location?.lat],
    [event.metadata?.logistics?.longitude, event.metadata?.logistics?.latitude],
    [event.metadata?.logistics?.lng, event.metadata?.logistics?.lat]
  ];

  for (const candidate of candidates) {
    const coordinates = coordinatesFromValue(candidate);
    if (coordinates) return coordinates;
  }

  return null;
};

const locationFromEvent = (event = {}) => {
  const logistics = event.metadata?.logistics || {};
  const city = String(event.city || event.location?.city || logistics.city || "").trim();
  const country = cleanCountry(event.country || event.location?.country || logistics.country || "");
  const region = String(
    event.region ||
      event.location?.region ||
      event.location?.province ||
      logistics.province ||
      logistics.region ||
      ""
  ).trim();

  return {
    city,
    country,
    region
  };
};

const resolveCuratedLocation = ({ city, country }) => {
  const cleanCity = normalizeText(city);
  if (!cleanCity) return null;

  return (
    locationByCityAndCountry.get(`${cleanCity}|${normalizeText(cleanCountry(country))}`) ||
    locationByCity.get(cleanCity) ||
    null
  );
};

module.exports = {
  cleanCountry,
  coordinatesFromEvent,
  locationFromEvent,
  normalizeText,
  resolveCuratedLocation
};
