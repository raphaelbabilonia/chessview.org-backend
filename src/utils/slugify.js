const trimSlug = (value) => String(value || "").replace(/(^-|-$)/g, "");

const shortenAtWord = (slug, maxLength) => {
  if (slug.length <= maxLength) return slug;

  const clipped = trimSlug(slug.slice(0, maxLength));
  const wordSafe = trimSlug(clipped.replace(/-[^-]*$/, ""));

  return wordSafe.length >= Math.min(24, maxLength) ? wordSafe : clipped;
};

const slugify = (value, { fallback = "event", maxLength = 100 } = {}) => {
  const slug = trimSlug(
    String(value || fallback)
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
  );

  return shortenAtWord(slug || fallback, maxLength);
};

module.exports = slugify;
module.exports.slugify = slugify;
