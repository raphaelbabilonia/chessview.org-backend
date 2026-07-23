const COUNTRY_ALIASES = {
  america: "United States",
  czechia: "Czech Republic",
  hongkong: "Hong Kong, China",
  "hong kong china": "Hong Kong, China",
  "republic of turkiye": "Turkey",
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
  ["Aalsmeer", "Netherlands", "Noord-Holland", [4.7622, 52.2592]],
  ["Aghios Kirykos, Ikaria island", "Greece", "North Aegean", [26.2944, 37.6148]],
  ["A Guarda", "Spain", "Galicia", [-8.8744, 41.9013]],
  ["Alacant", "Spain", "Valencian Community", [-0.4907, 38.3452]],
  ["Alicante", "Spain", "Valencian Community", [-0.4907, 38.3452]],
  ["Altos Miramar Avenida 37 N 963 (Miramar)", "Argentina", "Buenos Aires Province", [-57.842, -38.2716]],
  ["Amsterdam", "Netherlands", "Noord-Holland", [4.9041, 52.3676]],
  ["Azkoitia", "Spain", "Basque Country", [-2.311, 43.177]],
  ["Badalona", "Spain", "Catalonia", [2.245, 41.45]],
  ["Barcelona", "Spain", "Catalonia", [2.177073, 41.3825802]],
  ["Bia?ystok", "Poland", "Podlaskie", [23.1688, 53.1325]],
  ["Bialystok", "Poland", "Podlaskie", [23.1688, 53.1325]],
  ["Białystok", "Poland", "Podlaskie", [23.1688, 53.1325]],
  ["Birmingham", "England", "West Midlands", [-1.9027, 52.48]],
  ["Bormujos", "Spain", "Andalusia", [-6.0701, 37.3733]],
  ["Bormujos (Sevilla)", "Spain", "Andalusia", [-6.0701, 37.3733]],
  ["Brentwood", "England", "Essex", [0.3056, 51.6205]],
  ["Calvia", "Spain", "Balearic Islands", [2.5066, 39.5653]],
  ["Cerceda", "Spain", "Galicia", [-8.4701, 43.1886]],
  ["Cheadle", "England", "Greater Manchester", [-2.2146, 53.3943]],
  ["Chipiona", "Spain", "Andalusia", [-6.432, 36.7366]],
  ["Chipiona, Cadiz", "Spain", "Andalusia", [-6.432, 36.7366]],
  ["Collado Villalba", "Spain", "Community of Madrid", [-4.0067, 40.6266]],
  ["Colunga", "Spain", "Asturias", [-5.2706, 43.4859]],
  ["D?bki", "Poland", "West Pomeranian", [16.3289, 54.3806]],
  ["Dabki", "Poland", "West Pomeranian", [16.3289, 54.3806]],
  ["Dąbki", "Poland", "West Pomeranian", [16.3289, 54.3806]],
  ["Dekweneh", "Lebanon", "Mount Lebanon", [35.544, 33.8908]],
  ["Dordrecht", "Netherlands", "Zuid-Holland", [4.6901, 51.8133]],
  ["Dresden", "Germany", "Saxony", [13.7373, 51.0504]],
  ["Dziwn?w", "Poland", "West Pomeranian", [14.7664, 54.0282]],
  ["Dziwnow", "Poland", "West Pomeranian", [14.7664, 54.0282]],
  ["Dziwnów", "Poland", "West Pomeranian", [14.7664, 54.0282]],
  ["El Vendrell", "Spain", "Catalonia", [1.5349, 41.2207]],
  ["Ferrol", "Spain", "Galicia", [-8.2333, 43.4832]],
  ["Gouda", "Netherlands", "Zuid-Holland", [4.7105, 52.0116]],
  ["Granada", "Spain", "Andalusia", [-3.5986, 37.1773]],
  ["Horwich and Blackrod", "England", "Greater Manchester", [-2.5403, 53.5935]],
  ["Ibiza", "Spain", "Balearic Islands", [1.4329, 38.9067]],
  ["Ibiza (Baleares)", "Spain", "Balearic Islands", [1.4329, 38.9067]],
  ["L'Escala", "Spain", "Catalonia", [3.1324, 42.1246]],
  ["La Pobla de Lillet", "Spain", "Catalonia", [1.9748, 42.2444]],
  ["La Pobla de Lillet (Barcelona)", "Spain", "Catalonia", [1.9748, 42.2444]],
  ["La Puerta de Segura", "Spain", "Andalusia", [-2.7396, 38.3522]],
  ["Libreria Puro Verso / 18 de Julio 1199 / montevideo", "Uruguay", "Montevideo", [-56.1645, -34.9011]],
  ["Liga Santandereana de Ajedrez (Carrera 31 14", "Colombia", "Santander", [-73.1198, 7.1193]],
  ["Lanzarote", "Spain", "Canary Islands", [-13.5899, 29.0469]],
  ["Maidenhead", "England", "Berkshire", [-0.7199, 51.5225]],
  ["Mayrhofen / St. Veit/Glan", "Austria", "Carinthia", [14.36, 46.768]],
  ["Meis", "Spain", "Galicia", [-8.7078, 42.5155]],
  ["Münster", "Germany", "North Rhine-Westphalia", [7.6261, 51.9607]],
  ["Munster", "Germany", "North Rhine-Westphalia", [7.6261, 51.9607]],
  ["O Mosteiro, Meis", "Spain", "Galicia", [-8.7078, 42.5155]],
  ["Padul", "Spain", "Andalusia", [-3.625, 37.0244]],
  ["Paleochora Creta Island", "Greece", "Crete", [23.681, 35.2308]],
  ["Paw?owice", "Poland", "Silesian", [18.7175, 49.9616]],
  ["Pawlowice", "Poland", "Silesian", [18.7175, 49.9616]],
  ["Pawłowice", "Poland", "Silesian", [18.7175, 49.9616]],
  ["Putten", "Netherlands", "Gelderland", [5.6069, 52.2599]],
  ["Radzy?-S?awa", "Poland", "Lubusz", [16.0717, 51.8769]],
  ["Radzyn-Slawa", "Poland", "Lubusz", [16.0717, 51.8769]],
  ["Radzyń-Sława", "Poland", "Lubusz", [16.0717, 51.8769]],
  ["Rhyl", "England", "Denbighshire", [-3.489, 53.321]],
  ["Rotterdam", "Netherlands", "Zuid-Holland", [4.4777, 51.9244]],
  ["San Vicente de Raspeig", "Spain", "Valencian Community", [-0.5255, 38.3964]],
  ["Sant Adria de Besos", "Spain", "Catalonia", [2.2232, 41.4306]],
  ["Sant Boi de Llobregat", "Spain", "Catalonia", [2.043, 41.3436]],
  ["Sant Vicent del Raspeig", "Spain", "Valencian Community", [-0.5255, 38.3964]],
  ["Santa Pola", "Spain", "Valencian Community", [-0.5555, 38.1917]],
  ["Selce-Crikvenica (Croatia)", "Croatia", "Primorje-Gorski Kotar", [14.7211, 45.1564]],
  ["Sestao", "Spain", "Basque Country", [-2.9896, 43.3098]],
  ["Sestao, Basque Country", "Spain", "Basque Country", [-2.9896, 43.3098]],
  ["Sevilla", "Spain", "Andalusia", [-5.9845, 37.3891]],
  ["Stroud", "England", "Gloucestershire", [-2.2191, 51.7457]],
  ["Swinton", "England", "Greater Manchester", [-2.3412, 53.5124]],
  ["?winouj?cie", "Poland", "West Pomeranian", [14.2476, 53.9105]],
  ["Swinoujscie", "Poland", "West Pomeranian", [14.2476, 53.9105]],
  ["Świnoujście", "Poland", "West Pomeranian", [14.2476, 53.9105]],
  ["Toledo", "Spain", "Castilla-La Mancha", [-4.0273, 39.8628]],
  ["Torquay", "England", "Devon", [-3.5309, 50.4619]],
  ["Udenhout, Gemeente Tilburg", "Netherlands", "Noord-Brabant", [5.1437, 51.6092]],
  ["Valencia", "Spain", "Valencian Community", [-0.3763, 39.4699]],
  ["Villanueva de la Reina", "Spain", "Andalusia", [-3.9168, 38.0044]],
  ["Vitoria Gasteiz", "Spain", "Basque Country", [-2.6727, 42.8467]],
  ["Vitoria-Gasteiz", "Spain", "Basque Country", [-2.6727, 42.8467]],
  ["Wi?niew", "Poland", "Masovian", [22.2938, 52.0721]],
  ["Wisniew", "Poland", "Masovian", [22.2938, 52.0721]],
  ["Wiśniew", "Poland", "Masovian", [22.2938, 52.0721]],
  ["Zandvoort", "Netherlands", "Noord-Holland", [4.5331, 52.3711]],
  ["Zaragoza", "Spain", "Aragon", [-0.8891, 41.6488]],
  ["Zielona G?ra", "Poland", "Lubusz", [15.5062, 51.9356]],
  ["Zielona Gora", "Poland", "Lubusz", [15.5062, 51.9356]],
  ["Zielona Góra", "Poland", "Lubusz", [15.5062, 51.9356]]
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

const cityLookupKeys = (city) => {
  const value = String(city || "").trim();
  const leadingPlace = value.match(/^([^.,;]{3,60})\.\s+\S/)?.[1]?.trim();
  return [...new Set([value, leadingPlace].filter(Boolean).map(normalizeText))];
};

const resolveCuratedLocation = ({ city, country }) => {
  const cityKeys = cityLookupKeys(city);
  if (!cityKeys.length) return null;

  const normalizedCountry = normalizeText(cleanCountry(country));
  const scoped = cityKeys
    .map((cityKey) => locationByCityAndCountry.get(`${cityKey}|${normalizedCountry}`))
    .find(Boolean);
  if (scoped) return scoped;

  const unscoped = cityKeys.map((cityKey) => locationByCity.get(cityKey)).find(Boolean);
  if (!unscoped || (normalizedCountry && normalizeText(cleanCountry(unscoped.country)) !== normalizedCountry)) return null;
  return unscoped;
};

module.exports = {
  cleanCountry,
  coordinatesFromEvent,
  locationFromEvent,
  normalizeText,
  resolveCuratedLocation
};
