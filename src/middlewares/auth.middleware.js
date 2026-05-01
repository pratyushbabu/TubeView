import jwt from "jsonwebtoken";
import { User } from "../models/user.model.js";
import { apiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const getTokenFromRequest = (req) => {
  const bearerToken = req.header("Authorization")?.replace("Bearer ", "");
  return req.cookies?.accessToken || bearerToken;
};

const verifyJWT = asyncHandler(async (req, res, next) => {
  const token = getTokenFromRequest(req);

  if (!token) {
    throw new apiError(401, "Unauthorized request");
  }

  const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
  const user = await User.findById(decodedToken?._id).select(
    "-password -refreshToken"
  );

  if (!user) {
    throw new apiError(401, "Invalid access token");
  }

  req.user = user;
  next();
});

const optionalVerifyJWT = asyncHandler(async (req, res, next) => {
  const token = getTokenFromRequest(req);

  if (!token) {
    return next();
  }

  try {
    const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    req.user = await User.findById(decodedToken?._id).select(
      "-password -refreshToken"
    );
  } catch (error) {
    req.user = null;
  }

  return next();
});

export { optionalVerifyJWT, verifyJWT };
