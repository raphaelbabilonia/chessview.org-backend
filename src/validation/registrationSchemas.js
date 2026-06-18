const { z } = require("zod");
const { objectId } = require("./common");

// `event` (URL), `user` (authenticated user), and `status` (forced "pending")
// are not accepted from the body.
const createRegistrationSchema = z.object({
  section: objectId,
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  email: z.string().email(),
  club: z.string().optional(),
  rating: z.number().int().nonnegative().optional(),
  birthYear: z.number().int().nullish()
});

const updateRegistrationStatusSchema = z.object({
  status: z.enum(["pending", "approved", "cancelled", "rejected"])
});

module.exports = { createRegistrationSchema, updateRegistrationStatusSchema };
