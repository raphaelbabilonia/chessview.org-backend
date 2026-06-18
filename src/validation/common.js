const mongoose = require("mongoose");
const { z } = require("zod");

// A request-supplied id that must be a valid Mongo ObjectId string.
const objectId = z.string().refine((value) => mongoose.Types.ObjectId.isValid(value), {
  message: "Invalid id"
});

// Optional email that also permits an empty string (several models default email to "").
const optionalEmail = z.union([z.string().email(), z.literal("")]).optional();

// Rejects an empty object so PATCH endpoints require at least one field.
const nonEmpty = (schema) =>
  schema.refine((data) => Object.keys(data).length > 0, {
    message: "No updatable fields provided"
  });

module.exports = { objectId, optionalEmail, nonEmpty };
