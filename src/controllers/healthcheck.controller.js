import mongoose from "mongoose";
import { PROJECT_NAME } from "../constants.js";
import { apiResponse } from "../utils/apiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const healthcheck = asyncHandler(async (req, res) => {
  return res.status(200).json(
    new apiResponse(
      200,
      {
        name: PROJECT_NAME,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        database: mongoose.connection.readyState === 1 ? "connected" : "idle",
      },
      "OK"
    )
  );
});

export { healthcheck };
