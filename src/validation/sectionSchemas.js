const { z } = require("zod");
const { nonEmpty } = require("./common");

// `event` comes from the URL and is intentionally not accepted in the body.
const fields = {
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional(),
  maxPlayers: z.number().int().nonnegative().optional(),
  ratingMin: z.number().int().nonnegative().nullish(),
  ratingMax: z.number().int().nonnegative().nullish(),
  birthYearMin: z.number().int().nullish(),
  birthYearMax: z.number().int().nullish(),
  timeControl: z.string().optional(),
  roundsCount: z.number().int().nonnegative().optional()
};

const createSectionSchema = z.object(fields);
const updateSectionSchema = nonEmpty(z.object(fields).partial());

module.exports = { createSectionSchema, updateSectionSchema };
