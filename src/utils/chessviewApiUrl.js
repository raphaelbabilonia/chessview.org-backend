const normalizeApiRoot = (value) => {
  const input = String(value || "").trim();
  if (!input) throw new Error("Missing CHESSVIEW_API_BASE_URL");

  const url = new URL(input);
  const segments = url.pathname.split("/").filter(Boolean);
  while (
    segments.length >= 2 &&
    segments.at(-1).toLowerCase() === "api" &&
    segments.at(-2).toLowerCase() === "api"
  ) {
    segments.pop();
  }
  if (segments.at(-1)?.toLowerCase() !== "api") segments.push("api");
  url.pathname = `/${segments.join("/")}`;
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/+$/, "");
};

const chessviewApiUrl = (baseUrl, endpoint = "") => {
  const root = normalizeApiRoot(baseUrl);
  const cleanEndpoint = String(endpoint || "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/^api(?:\/+|$)/i, "");
  return cleanEndpoint ? `${root}/${cleanEndpoint}` : root;
};

module.exports = { chessviewApiUrl, normalizeApiRoot };
