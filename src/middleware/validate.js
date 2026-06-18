// Validates req.body against a zod schema. On failure responds 422 with the
// standard error envelope ({ success, message, errors: field -> message }). On
// success replaces req.body with the parsed result, which contains ONLY the
// fields declared in the schema — so unknown/protected fields (e.g. organizer,
// slug) are stripped and cannot be mass-assigned.
const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    const flat = result.error.flatten();
    const errors = Object.fromEntries(
      Object.entries(flat.fieldErrors).map(([field, messages]) => [field, messages[0]])
    );
    return res.status(422).json({
      success: false,
      message: flat.formErrors[0] || "Validation failed",
      errors
    });
  }
  req.body = result.data;
  next();
};

module.exports = validate;
