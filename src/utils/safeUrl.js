// Links reach public pages from organizers and collection agents. Only web links
// are ever valid: anything else (javascript:, data:, a browser-extension wrapper
// copied from a PDF viewer) is either hostile or broken for every visitor.
const WEB_PROTOCOLS = new Set(["http:", "https:"]);

const safeHttpUrl = (value) => {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return "";
  try {
    return WEB_PROTOCOLS.has(new URL(text).protocol) ? text : "";
  } catch {
    return "";
  }
};

const safeLinks = (links) =>
  (Array.isArray(links) ? links : []).filter((link) => safeHttpUrl(link?.url));

module.exports = { safeHttpUrl, safeLinks };
