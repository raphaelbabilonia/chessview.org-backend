const { z } = require("zod");

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
  maxPlayers: z.number().int().nonnegative().optional(),
  contactEmail: z.union([z.string().email(), z.literal("")]).optional(),
  websiteUrl: z.string().optional(),
  regulationsUrl: z.string().optional(),
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
