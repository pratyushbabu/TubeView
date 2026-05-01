import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import mongoose from "mongoose";
import { MAX_JSON_SIZE, PROJECT_NAME } from "./constants.js";
import {
  errorHandler,
  notFoundHandler,
} from "./middlewares/error.middleware.js";
import healthcheckRouter from "./routes/healthcheck.routes.js";
import userRouter from "./routes/user.routes.js";
import videoRouter from "./routes/video.routes.js";
import { apiError } from "./utils/apiError.js";
import { apiResponse } from "./utils/apiResponse.js";

const app = express();

const allowedOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.set("trust proxy", 1);

app.use(
  cors({
    origin(origin, callback) {
      if (
        !origin ||
        allowedOrigins.length === 0 ||
        allowedOrigins.includes("*") ||
        allowedOrigins.includes(origin)
      ) {
        return callback(null, true);
      }

      return callback(new apiError(403, "Not allowed by CORS"));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: MAX_JSON_SIZE }));
app.use(express.urlencoded({ extended: true, limit: MAX_JSON_SIZE }));
app.use(express.static("public"));
app.use(cookieParser());

app.get("/", (req, res) => {
  return res.status(200).json(
    new apiResponse(
      200,
      {
        name: PROJECT_NAME,
        docs: "/api/v1/healthcheck",
      },
      "API is running"
    )
  );
});

app.use("/healthcheck", healthcheckRouter);
app.use("/api/v1/healthcheck", healthcheckRouter);

app.use("/api/v1", (req, res, next) => {
  const isPublicVideoRead =
    req.method === "GET" && req.path.startsWith("/videos");
  const isAuthenticatedUserRead =
    req.method === "GET" &&
    (req.path.startsWith("/user/current-user") ||
      req.path.startsWith("/users/current-user") ||
      req.path.startsWith("/user/history") ||
      req.path.startsWith("/users/history"));
  const isLoginOrRefresh =
    req.method === "POST" &&
    (req.path.startsWith("/user/login") ||
      req.path.startsWith("/users/login") ||
      req.path.startsWith("/user/refresh-token") ||
      req.path.startsWith("/users/refresh-token"));

  if (
    (isPublicVideoRead || isAuthenticatedUserRead || isLoginOrRefresh) &&
    mongoose.connection.readyState !== 1
  ) {
    return res.status(503).json(
      new apiResponse(
        503,
        {
          reason: req.app.locals.databaseUnavailable || "Database unavailable",
        },
        "Database is unavailable. Start MongoDB or set MONGODB_URI to a running database."
      )
    );
  }

  return next();
});

app.use("/api/v1/user", userRouter);
app.use("/api/v1/users", userRouter);
app.use("/api/v1/videos", videoRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export { app };
