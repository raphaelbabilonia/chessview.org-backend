const { z } = require("zod");
const { objectId } = require("./common");

const resultEnum = z.enum([
  "pending",
  "1-0",
  "0-1",
  "1/2-1/2",
  "bye-white",
  "bye-black",
  "half-bye",
  "zero-bye",
  "forfeit-white",
  "forfeit-black"
]);

// `event`/`section`/`round` come from the URL/round and are not accepted in the body.
const createPairingSchema = z.object({
  boardNumber: z.number().int().positive(),
  whitePlayer: objectId,
  blackPlayer: objectId.nullish(), // null = a bye
  result: resultEnum.optional(),
  notes: z.string().optional()
});

const updatePairingResultSchema = z.object({
  result: resultEnum,
  notes: z.string().optional()
});

module.exports = { createPairingSchema, updatePairingResultSchema };
