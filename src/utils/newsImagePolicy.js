const REQUIRED_NEWS_IMAGE_REASON = "missing required publisher image";
const REQUIRED_NEWS_IMAGE_FLAG = "missing_required_image";
const REQUIRED_NEWS_IMAGE_URL_PATTERN = /^https?:\/\/\S+/i;

const hasRequiredNewsImage = (value) =>
  typeof value === "string" && REQUIRED_NEWS_IMAGE_URL_PATTERN.test(value.trim());

const publicNewsImageQuery = {
  imageUrl: { $exists: true, $type: "string", $regex: REQUIRED_NEWS_IMAGE_URL_PATTERN }
};

const missingRequiredNewsImageQuery = {
  $or: [
    { imageUrl: { $exists: false } },
    { imageUrl: null },
    { imageUrl: { $not: REQUIRED_NEWS_IMAGE_URL_PATTERN } }
  ]
};

module.exports = {
  REQUIRED_NEWS_IMAGE_FLAG,
  REQUIRED_NEWS_IMAGE_REASON,
  hasRequiredNewsImage,
  missingRequiredNewsImageQuery,
  publicNewsImageQuery
};
