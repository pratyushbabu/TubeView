import mongoose from "mongoose";
import { User } from "../models/user.model.js";
import { Video } from "../models/video.model.js";
import { apiError } from "../utils/apiError.js";
import { apiResponse } from "../utils/apiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  deleteFromCloudinary,
  removeLocalFile,
  uploadOnCloudinary,
} from "../utils/cloudinary.js";

const normalizeString = (value) =>
  typeof value === "string" ? value.trim() : "";

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getUploadedFilePath = (req, fieldName) =>
  req.files?.[fieldName]?.[0]?.path;

const cleanupRequestFiles = (req) => {
  Object.values(req.files || {})
    .flat()
    .forEach((file) => removeLocalFile(file.path));
};

const assertValidObjectId = (id, label = "Resource") => {
  if (!mongoose.isValidObjectId(id)) {
    throw new apiError(400, `${label} id is invalid`);
  }
};

const parsePositiveInteger = (value, fallback, max) => {
  const parsedValue = Number.parseInt(value, 10);

  if (Number.isNaN(parsedValue) || parsedValue < 1) {
    return fallback;
  }

  return Math.min(parsedValue, max);
};

const parseBoolean = (value) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    if (value.toLowerCase() === "true") {
      return true;
    }

    if (value.toLowerCase() === "false") {
      return false;
    }
  }

  return undefined;
};

const getOwnedVideo = async (videoId, userId) => {
  assertValidObjectId(videoId, "Video");

  const video = await Video.findById(videoId);

  if (!video) {
    throw new apiError(404, "Video not found");
  }

  if (!video.owner.equals(userId)) {
    throw new apiError(403, "You are not allowed to modify this video");
  }

  return video;
};

const publishVideo = asyncHandler(async (req, res) => {
  const title = normalizeString(req.body.title);
  const description = normalizeString(req.body.description);
  const videoLocalPath = getUploadedFilePath(req, "videoFile");
  const thumbnailLocalPath = getUploadedFilePath(req, "thumbnail");

  let videoUpload = null;
  let thumbnailUpload = null;

  try {
    if (!title || !description) {
      throw new apiError(400, "Title and description are required");
    }

    if (!videoLocalPath) {
      throw new apiError(400, "Video file is required");
    }

    if (!thumbnailLocalPath) {
      throw new apiError(400, "Thumbnail file is required");
    }

    videoUpload = await uploadOnCloudinary(
      videoLocalPath,
      "youtube-duplicate/videos"
    );
    thumbnailUpload = await uploadOnCloudinary(
      thumbnailLocalPath,
      "youtube-duplicate/thumbnails"
    );

    if (!videoUpload) {
      throw new apiError(400, "Video upload failed");
    }

    if (!thumbnailUpload) {
      throw new apiError(400, "Thumbnail upload failed");
    }

    const video = await Video.create({
      title,
      description,
      videoFile: videoUpload.secure_url,
      videoFilePublicId: videoUpload.public_id,
      thumbnail: thumbnailUpload.secure_url,
      thumbnailPublicId: thumbnailUpload.public_id,
      duration: videoUpload.duration || 0,
      owner: req.user._id,
    });

    const createdVideo = await Video.findById(video._id).populate(
      "owner",
      "username fullName avatar"
    );

    return res
      .status(201)
      .json(new apiResponse(201, createdVideo, "Video published successfully"));
  } catch (error) {
    cleanupRequestFiles(req);
    await deleteFromCloudinary(videoUpload?.public_id, "video");
    await deleteFromCloudinary(thumbnailUpload?.public_id);
    throw error;
  }
});

const getAllVideos = asyncHandler(async (req, res) => {
  const page = parsePositiveInteger(req.query.page, 1, 10000);
  const limit = parsePositiveInteger(req.query.limit, 10, 50);
  const skip = (page - 1) * limit;
  const searchQuery = normalizeString(req.query.query);
  const username = normalizeString(req.query.username).toLowerCase();
  const sortBy = ["createdAt", "views", "duration", "title"].includes(
    req.query.sortBy
  )
    ? req.query.sortBy
    : "createdAt";
  const sortType = req.query.sortType === "asc" ? 1 : -1;

  const filter = { isPublished: true };

  if (searchQuery) {
    const safeSearchQuery = escapeRegex(searchQuery);

    filter.$or = [
      { title: { $regex: safeSearchQuery, $options: "i" } },
      { description: { $regex: safeSearchQuery, $options: "i" } },
    ];
  }

  if (username) {
    const owner = await User.findOne({ username }).select("_id");

    if (!owner) {
      return res.status(200).json(
        new apiResponse(
          200,
          {
            videos: [],
            pagination: { page, limit, totalVideos: 0, totalPages: 0 },
          },
          "Videos fetched successfully"
        )
      );
    }

    filter.owner = owner._id;
  }

  const [videos, totalVideos] = await Promise.all([
    Video.find(filter)
      .sort({ [sortBy]: sortType })
      .skip(skip)
      .limit(limit)
      .populate("owner", "username fullName avatar"),
    Video.countDocuments(filter),
  ]);

  return res.status(200).json(
    new apiResponse(
      200,
      {
        videos,
        pagination: {
          page,
          limit,
          totalVideos,
          totalPages: Math.ceil(totalVideos / limit),
        },
      },
      "Videos fetched successfully"
    )
  );
});

const getVideoById = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  assertValidObjectId(videoId, "Video");

  let video = await Video.findById(videoId).populate(
    "owner",
    "username fullName avatar"
  );

  if (!video) {
    throw new apiError(404, "Video not found");
  }

  const isOwner =
    req.user && video.owner?._id?.toString() === req.user._id.toString();

  if (!video.isPublished && !isOwner) {
    throw new apiError(404, "Video not found");
  }

  if (!isOwner) {
    video = await Video.findByIdAndUpdate(
      videoId,
      { $inc: { views: 1 } },
      { new: true }
    ).populate("owner", "username fullName avatar");

    if (!video) {
      throw new apiError(404, "Video not found");
    }

    if (req.user?._id) {
      await User.findByIdAndUpdate(req.user._id, {
        $addToSet: { watchHistory: video._id },
      });
    }
  }

  return res
    .status(200)
    .json(new apiResponse(200, video, "Video fetched successfully"));
});

const updateVideo = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  const video = await getOwnedVideo(videoId, req.user._id);
  const title = normalizeString(req.body.title);
  const description = normalizeString(req.body.description);
  const isPublished = parseBoolean(req.body.isPublished);
  const thumbnailLocalPath = getUploadedFilePath(req, "thumbnail");

  const updatePayload = {};
  let thumbnailUpload = null;

  try {
    if ("title" in req.body) {
      if (!title) {
        throw new apiError(400, "Title cannot be empty");
      }
      updatePayload.title = title;
    }

    if ("description" in req.body) {
      if (!description) {
        throw new apiError(400, "Description cannot be empty");
      }
      updatePayload.description = description;
    }

    if (isPublished !== undefined) {
      updatePayload.isPublished = isPublished;
    }

    if (thumbnailLocalPath) {
      thumbnailUpload = await uploadOnCloudinary(
        thumbnailLocalPath,
        "youtube-duplicate/thumbnails"
      );

      if (!thumbnailUpload) {
        throw new apiError(400, "Thumbnail upload failed");
      }

      updatePayload.thumbnail = thumbnailUpload.secure_url;
      updatePayload.thumbnailPublicId = thumbnailUpload.public_id;
    }

    if (Object.keys(updatePayload).length === 0) {
      throw new apiError(400, "No valid update fields provided");
    }

    const updatedVideo = await Video.findByIdAndUpdate(
      video._id,
      { $set: updatePayload },
      { new: true, runValidators: true }
    ).populate("owner", "username fullName avatar");

    if (thumbnailUpload?.public_id) {
      await deleteFromCloudinary(video.thumbnailPublicId);
    }

    return res
      .status(200)
      .json(new apiResponse(200, updatedVideo, "Video updated successfully"));
  } catch (error) {
    cleanupRequestFiles(req);
    await deleteFromCloudinary(thumbnailUpload?.public_id);
    throw error;
  }
});

const deleteVideo = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  const video = await getOwnedVideo(videoId, req.user._id);

  await Video.findByIdAndDelete(video._id);
  await User.updateMany({}, { $pull: { watchHistory: video._id } });
  await deleteFromCloudinary(video.videoFilePublicId, "video");
  await deleteFromCloudinary(video.thumbnailPublicId);

  return res
    .status(200)
    .json(new apiResponse(200, {}, "Video deleted successfully"));
});

const togglePublishStatus = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  const video = await getOwnedVideo(videoId, req.user._id);

  video.isPublished = !video.isPublished;
  await video.save({ validateBeforeSave: false });

  return res
    .status(200)
    .json(new apiResponse(200, video, "Video publish status updated"));
});

export {
  deleteVideo,
  getAllVideos,
  getVideoById,
  publishVideo,
  togglePublishStatus,
  updateVideo,
};
