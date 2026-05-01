import multer from "multer";
import { apiError } from "../utils/apiError.js";

const notFoundHandler = (req, res, next) => {
  next(new apiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
};

const normalizeError = (error) => {
  if (error instanceof apiError) {
    return error;
  }

  if (error instanceof multer.MulterError) {
    return new apiError(400, error.message);
  }

  if (error.name === "CastError") {
    return new apiError(400, "Invalid resource id");
  }

  if (error.code === 11000) {
    const duplicatedFields = Object.keys(error.keyValue || {});
    return new apiError(
      409,
      `${duplicatedFields.join(", ") || "Resource"} already exists`
    );
  }

  if (error.name === "ValidationError") {
    const errors = Object.values(error.errors || {}).map(
      (item) => item.message
    );
    return new apiError(400, "Validation error", errors);
  }

  if (
    error.name === "JsonWebTokenError" ||
    error.name === "TokenExpiredError"
  ) {
    return new apiError(401, "Invalid or expired token");
  }

  if (error instanceof SyntaxError && "body" in error) {
    return new apiError(400, "Invalid JSON payload");
  }

  return new apiError(500, error.message || "Internal server error");
};

const errorHandler = (error, req, res, next) => {
  const normalizedError = normalizeError(error);
  const statusCode = normalizedError.statusCode || 500;

  return res.status(statusCode).json({
    statusCode,
    data: normalizedError.data,
    message: normalizedError.message,
    success: false,
    errors: normalizedError.errors,
    ...(process.env.NODE_ENV !== "production" && {
      stack: normalizedError.stack,
    }),
  });
};

export { errorHandler, notFoundHandler };
