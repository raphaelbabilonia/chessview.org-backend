const multer = require("multer");
const logger = require("../services/logger");

const errorMiddleware = (err, req, res, next) => {
  let status = err.statusCode || err.status || 500;

  const response = {
    success: false,
    message: status < 500 ? "Request rejected" : "Internal server error",
    requestId: req.requestId
  };

  if (err.name === "ValidationError") {
    status = 422;
    response.message = "Validation failed";
    response.errors = Object.fromEntries(
      Object.entries(err.errors).map(([field, error]) => [field, error.message])
    );
  }

  // MongoDB duplicate-key (unique index) violation -> conflict, not a 500.
  if (err.code === 11000) {
    status = 409;
    response.message = "Duplicate key";
  }

  if (err instanceof multer.MulterError) {
    status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    response.message = err.code === "LIMIT_FILE_SIZE" ? "Upload exceeds the allowed size" : "Invalid upload";
  }

  logger.error("http.request_failed", {
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    status,
    error: err
  });

  res.status(status).json(response);
};

module.exports = errorMiddleware;
