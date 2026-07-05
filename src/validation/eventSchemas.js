const { z } = require("zod");

const longitude = z.number().finite().min(-180).max(180);
const latitude = z.number().finite().min(-90).max(90);
const optionalCoordinate = (schema) => z.union([schema, z.null()]).optional();

const locationSchema = z
  .object({
    city: z.string().trim().optional(),
    region: z.string().trim().optional(),
    country: z.string().trim().optional(),
    latitude: optionalCoordinate(latitude),
    longitude: optionalCoordinate(longitude),
    coordinates: z.tuple([longitude, latitude]).optional(),
    coordinateStatus: z.enum(["", "resolved", "missing", "manual-review"]).optional(),
    coordinateSource: z.string().trim().max(200).optional(),
    coordinateLabel: z.string().trim().max(500).optional(),
    geocodedAt: z.string().datetime().optional()
  })
  .partial();

// Editable Event fields. `organizer`, `slug`, `_id`, and timestamps are
// intentionally absent — unknown keys are stripped on parse, so they can't be
// mass-assigned via the request body.
const fields = {
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).optional(),
  city: z.string().trim().min(1),
  venueName: z.string().optional(),
  address: z.string().optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  status: z.enum(["draft", "published", "completed", "cancelled"]).optional(),
  registrationStatus: z.enum(["closed", "open", "full"]).optional(),
  timeControl: z.string().optional(),
  country: z.string().trim().optional(),
  region: z.string().trim().optional(),
  location: locationSchema.optional(),
  ratingType: z.enum(["", "FIDE", "national", "unrated"]).optional(),
  maxPlayers: z.number().int().nonnegative().optional(),
  contactEmail: z.union([z.string().email(), z.literal("")]).optional(),
  websiteUrl: z.string().optional(),
  resultsUrl: z.string().optional(),
  regulationsUrl: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  isPublic: z.boolean().optional()
};

const endNotBeforeStart = (data) =>
  !(data.startDate && data.endDate) || new Date(data.endDate) >= new Date(data.startDate);
const dateOrderError = { message: "endDate must be on or after startDate", path: ["endDate"] };

// POST /api/events — title/city/startDate/endDate required.
const createEventSchema = z.object(fields).refine(endNotBeforeStart, dateOrderError);

// PATCH /api/events/:id — every field optional, but at least one must be present.
const updateEventSchema = z
  .object(fields)
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: "No updatable fields provided" })
  .refine(endNotBeforeStart, dateOrderError);

module.exports = {
  createEventSchema,
  updateEventSchema
};
