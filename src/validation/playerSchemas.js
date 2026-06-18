const { z } = require("zod");
const { objectId, optionalEmail, nonEmpty } = require("./common");

// `event` (URL) and `user` are not accepted from the body.
const baseFields = {
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  federation: z.string().optional(),
  club: z.string().optional(),
  rating: z.number().int().nonnegative().optional(),
  birthYear: z.number().int().nullish(),
  email: optionalEmail,
  status: z.enum(["active", "withdrawn"]).optional()
};

// Create takes the target `section` in the body.
const createPlayerSchema = z.object({ section: objectId, ...baseFields });

// Update excludes `event`/`section`/`user` (no reparenting).
const updatePlayerSchema = nonEmpty(z.object(baseFields).partial());

module.exports = { createPlayerSchema, updatePlayerSchema };
