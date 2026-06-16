const errorMiddleware = (err, req, res, next) => {
  let status = err.statusCode || err.status || 500;

  const response = {
    success: false,
    message: err.message || "Server error"
  };

  if (err.name === "ValidationError") {
    status = 422;
    response.message = "Validation failed";
    response.errors = Object.fromEntries(
      Object.entries(err.errors).map(([field, error]) => [field, error.message])
    );
  }

  if (process.env.NODE_ENV !== "production" && status >= 500) {
    response.stack = err.stack;
  }

  res.status(status).json(response);
};

module.exports = errorMiddleware;
