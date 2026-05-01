import jwt from "jsonwebtoken";
import { User } from "../models/user.model.js";
import { apiError } from "../utils/apiError.js";
import { apiResponse } from "../utils/apiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  deleteFromCloudinary,
  removeLocalFile,
  uploadOnCloudinary,
} from "../utils/cloudinary.js";

const getCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
});

const normalizeRequiredString = (value) =>
  typeof value === "string" ? value.trim() : "";

const normalizeUsername = (username) =>
  normalizeRequiredString(username).toLowerCase();

const normalizeEmail = (email) => normalizeRequiredString(email).toLowerCase();

const assertRequiredFields = (fields) => {
  const missingFields = Object.entries(fields)
    .filter(([, value]) => normalizeRequiredString(value).length === 0)
    .map(([key]) => key);

  if (missingFields.length > 0) {
    throw new apiError(400, "All fields are required", missingFields);
  }
};

const getUploadedFilePath = (req, fieldName) => {
  if (req.file?.fieldname === fieldName) {
    return req.file.path;
  }

  return req.files?.[fieldName]?.[0]?.path;
};

const cleanupRequestFiles = (req) => {
  if (req.file?.path) {
    removeLocalFile(req.file.path);
  }

  Object.values(req.files || {})
    .flat()
    .forEach((file) => removeLocalFile(file.path));
};

const generateAccessAndRefreshTokens = async (userId) => {
  const user = await User.findById(userId).select("+refreshToken");

  if (!user) {
    throw new apiError(404, "User not found");
  }

  const accessToken = user.generateAccessToken();
  const refreshToken = user.generateRefreshToken();

  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });

  return { accessToken, refreshToken };
};

const registerUser = asyncHandler(async (req, res) => {
  const { fullName, password } = req.body;
  const username = normalizeUsername(req.body.username);
  const email = normalizeEmail(req.body.email);

  try {
    assertRequiredFields({ fullName, email, username, password });

    const avatarLocalPath = getUploadedFilePath(req, "avatar");
    const coverImageLocalPath = getUploadedFilePath(req, "coverImage");

    if (!avatarLocalPath) {
      throw new apiError(400, "Avatar file is required");
    }

    const userExists = await User.findOne({
      $or: [{ username }, { email }],
    });

    if (userExists) {
      throw new apiError(
        409,
        "User already exists with the given email or username"
      );
    }

    const avatarUpload = await uploadOnCloudinary(
      avatarLocalPath,
      "youtube-duplicate/users"
    );
    const coverImageUpload = coverImageLocalPath
      ? await uploadOnCloudinary(coverImageLocalPath, "youtube-duplicate/users")
      : null;

    if (!avatarUpload) {
      throw new apiError(400, "Avatar upload failed");
    }

    if (coverImageLocalPath && !coverImageUpload) {
      await deleteFromCloudinary(avatarUpload.public_id);
      throw new apiError(400, "Cover image upload failed");
    }

    let user;

    try {
      user = await User.create({
        fullName: normalizeRequiredString(fullName),
        email,
        password,
        username,
        avatar: avatarUpload.secure_url,
        avatarPublicId: avatarUpload.public_id,
        coverImage: coverImageUpload?.secure_url || "",
        coverImagePublicId: coverImageUpload?.public_id || "",
      });
    } catch (error) {
      await deleteFromCloudinary(avatarUpload.public_id);
      await deleteFromCloudinary(coverImageUpload?.public_id);
      throw error;
    }

    const createdUser = await User.findById(user._id).select(
      "-password -refreshToken"
    );

    if (!createdUser) {
      throw new apiError(500, "User registration failed");
    }

    return res
      .status(201)
      .json(new apiResponse(201, createdUser, "User registered successfully"));
  } catch (error) {
    cleanupRequestFiles(req);
    throw error;
  }
});

const loginUser = asyncHandler(async (req, res) => {
  const username = normalizeUsername(req.body.username);
  const email = normalizeEmail(req.body.email);
  const password = normalizeRequiredString(req.body.password);

  if ((!username && !email) || !password) {
    throw new apiError(400, "Username or email and password are required");
  }

  const user = await User.findOne({
    $or: [{ username }, { email }],
  }).select("+password +refreshToken");

  if (!user || !(await user.isPasswordCorrect(password))) {
    throw new apiError(401, "Invalid user credentials");
  }

  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
    user._id
  );
  const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  return res
    .status(200)
    .cookie("accessToken", accessToken, getCookieOptions())
    .cookie("refreshToken", refreshToken, getCookieOptions())
    .json(
      new apiResponse(
        200,
        { user: loggedInUser, accessToken, refreshToken },
        "User logged in successfully"
      )
    );
});

const logoutUser = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $unset: {
        refreshToken: 1,
      },
    },
    { new: true }
  );

  return res
    .status(200)
    .clearCookie("accessToken", getCookieOptions())
    .clearCookie("refreshToken", getCookieOptions())
    .json(new apiResponse(200, {}, "User logged out successfully"));
});

const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken =
    req.cookies?.refreshToken || req.body.refreshToken;

  if (!incomingRefreshToken) {
    throw new apiError(401, "Refresh token is required");
  }

  const decodedToken = jwt.verify(
    incomingRefreshToken,
    process.env.REFRESH_TOKEN_SECRET
  );

  const user = await User.findById(decodedToken?._id).select("+refreshToken");

  if (!user || incomingRefreshToken !== user.refreshToken) {
    throw new apiError(401, "Invalid refresh token");
  }

  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
    user._id
  );

  return res
    .status(200)
    .cookie("accessToken", accessToken, getCookieOptions())
    .cookie("refreshToken", refreshToken, getCookieOptions())
    .json(
      new apiResponse(
        200,
        { accessToken, refreshToken },
        "Access token refreshed successfully"
      )
    );
});

const changeCurrentPassword = asyncHandler(async (req, res) => {
  const oldPassword = normalizeRequiredString(req.body.oldPassword);
  const newPassword = normalizeRequiredString(req.body.newPassword);

  assertRequiredFields({ oldPassword, newPassword });

  if (oldPassword === newPassword) {
    throw new apiError(400, "New password must be different");
  }

  const user = await User.findById(req.user?._id).select("+password");

  if (!user || !(await user.isPasswordCorrect(oldPassword))) {
    throw new apiError(400, "Old password is incorrect");
  }

  user.password = newPassword;
  await user.save();

  return res
    .status(200)
    .json(new apiResponse(200, {}, "Password changed successfully"));
});

const getCurrentUser = asyncHandler(async (req, res) => {
  return res
    .status(200)
    .json(new apiResponse(200, req.user, "Current user fetched successfully"));
});

const updateAccountDetails = asyncHandler(async (req, res) => {
  const fullName = normalizeRequiredString(req.body.fullName);
  const email = normalizeEmail(req.body.email);

  if (!fullName && !email) {
    throw new apiError(400, "Full name or email is required");
  }

  if (email) {
    const emailOwner = await User.findOne({
      email,
      _id: { $ne: req.user._id },
    });

    if (emailOwner) {
      throw new apiError(409, "Email is already in use");
    }
  }

  const updatedUser = await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        ...(fullName && { fullName }),
        ...(email && { email }),
      },
    },
    { new: true, runValidators: true }
  ).select("-password -refreshToken");

  return res
    .status(200)
    .json(new apiResponse(200, updatedUser, "Account details updated"));
});

const updateUserAvatar = asyncHandler(async (req, res) => {
  const avatarLocalPath = getUploadedFilePath(req, "avatar");
  let avatarUpload = null;

  try {
    if (!avatarLocalPath) {
      throw new apiError(400, "Avatar file is required");
    }

    avatarUpload = await uploadOnCloudinary(
      avatarLocalPath,
      "youtube-duplicate/users"
    );

    if (!avatarUpload) {
      throw new apiError(400, "Avatar upload failed");
    }

    const currentUser = await User.findById(req.user._id);

    if (!currentUser) {
      throw new apiError(404, "User not found");
    }

    const previousPublicId = currentUser.avatarPublicId;

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      {
        $set: {
          avatar: avatarUpload.secure_url,
          avatarPublicId: avatarUpload.public_id,
        },
      },
      { new: true, runValidators: true }
    ).select("-password -refreshToken");

    await deleteFromCloudinary(previousPublicId);

    return res
      .status(200)
      .json(new apiResponse(200, updatedUser, "Avatar updated successfully"));
  } catch (error) {
    cleanupRequestFiles(req);
    await deleteFromCloudinary(avatarUpload?.public_id);
    throw error;
  }
});

const updateUserCoverImage = asyncHandler(async (req, res) => {
  const coverImageLocalPath = getUploadedFilePath(req, "coverImage");
  let coverImageUpload = null;

  try {
    if (!coverImageLocalPath) {
      throw new apiError(400, "Cover image file is required");
    }

    coverImageUpload = await uploadOnCloudinary(
      coverImageLocalPath,
      "youtube-duplicate/users"
    );

    if (!coverImageUpload) {
      throw new apiError(400, "Cover image upload failed");
    }

    const currentUser = await User.findById(req.user._id);

    if (!currentUser) {
      throw new apiError(404, "User not found");
    }

    const previousPublicId = currentUser.coverImagePublicId;

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      {
        $set: {
          coverImage: coverImageUpload.secure_url,
          coverImagePublicId: coverImageUpload.public_id,
        },
      },
      { new: true, runValidators: true }
    ).select("-password -refreshToken");

    await deleteFromCloudinary(previousPublicId);

    return res
      .status(200)
      .json(
        new apiResponse(200, updatedUser, "Cover image updated successfully")
      );
  } catch (error) {
    cleanupRequestFiles(req);
    await deleteFromCloudinary(coverImageUpload?.public_id);
    throw error;
  }
});

const getUserChannelProfile = asyncHandler(async (req, res) => {
  const username = normalizeUsername(req.params.username);

  if (!username) {
    throw new apiError(400, "Username is required");
  }

  const channel = await User.aggregate([
    {
      $match: { username },
    },
    {
      $lookup: {
        from: "videos",
        localField: "_id",
        foreignField: "owner",
        pipeline: [
          { $match: { isPublished: true } },
          { $sort: { createdAt: -1 } },
          { $limit: 10 },
          {
            $project: {
              title: 1,
              description: 1,
              thumbnail: 1,
              duration: 1,
              views: 1,
              createdAt: 1,
            },
          },
        ],
        as: "latestVideos",
      },
    },
    {
      $lookup: {
        from: "videos",
        localField: "_id",
        foreignField: "owner",
        pipeline: [{ $match: { isPublished: true } }],
        as: "publishedVideos",
      },
    },
    {
      $addFields: {
        publishedVideosCount: { $size: "$publishedVideos" },
      },
    },
    {
      $project: {
        password: 0,
        refreshToken: 0,
        publishedVideos: 0,
      },
    },
  ]);

  if (!channel?.length) {
    throw new apiError(404, "Channel not found");
  }

  return res
    .status(200)
    .json(new apiResponse(200, channel[0], "Channel profile fetched"));
});

const getWatchHistory = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id)
    .populate({
      path: "watchHistory",
      match: { isPublished: true },
      populate: {
        path: "owner",
        select: "username fullName avatar",
      },
      options: { sort: { createdAt: -1 } },
    })
    .select("watchHistory");

  return res
    .status(200)
    .json(new apiResponse(200, user.watchHistory, "Watch history fetched"));
});

export {
  changeCurrentPassword,
  getCurrentUser,
  getUserChannelProfile,
  getWatchHistory,
  loginUser,
  logoutUser,
  refreshAccessToken,
  registerUser,
  updateAccountDetails,
  updateUserAvatar,
  updateUserCoverImage,
};
