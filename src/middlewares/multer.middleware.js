import fs from "fs";
import path from "path";
import multer from "multer";
import { apiError } from "../utils/apiError.js";

const tempUploadPath = path.resolve("public", "temp");

const ensureTempDirectory = () => {
  fs.mkdirSync(tempUploadPath, { recursive: true });
};

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    ensureTempDirectory();
    cb(null, tempUploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const safeOriginalName = file.originalname.replace(/[^\w.\-]/g, "_");
    cb(null, `${uniqueSuffix}-${safeOriginalName}`);
  },
});

const fileFilter = (req, file, cb) => {
  const isImageField = ["avatar", "coverImage", "thumbnail"].includes(
    file.fieldname
  );
  const isVideoField = file.fieldname === "videoFile";

  if (isImageField && !file.mimetype.startsWith("image/")) {
    return cb(new apiError(400, `${file.fieldname} must be an image file`));
  }

  if (isVideoField && !file.mimetype.startsWith("video/")) {
    return cb(new apiError(400, "videoFile must be a video file"));
  }

  return cb(null, true);
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 250 * 1024 * 1024,
    files: 2,
  },
});
