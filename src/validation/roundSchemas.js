const { z } = require("zod");
const { objectId, nonEmpty } = require("./common");

// Create takes the target `section` in the body; `event` comes from the URL.
const createRoundSchema = z.object({
  section: objectId,
  number: z.number().int().positive(),
  name: z.string().max(200).optional(),
  status: z.enum(["draft", "published", "completed"]).optional(),
  startsAt: z.string().datetime().nullish()
});

// Update excludes `event`/`section` so a round can't be reparented via the body.
const updateRoundSchema = nonEmpty(
  z
    .object({
      number: z.number().int().positive(),
      name: z.string().max(200),
      status: z.enum(["draft", "published", "completed"]),
      startsAt: z.string().datetime().nullable()
    })
    .partial()
);

module.exports = { createRoundSchema, updateRoundSchema };
