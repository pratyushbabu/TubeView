import fs from "fs";
import { v2 as cloudinary } from "cloudinary";

const configureCloudinary = () => {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
};

const removeLocalFile = (localFilePath) => {
  if (localFilePath && fs.existsSync(localFilePath)) {
    fs.unlinkSync(localFilePath);
  }
};

const uploadOnCloudinary = async (
  localFilePath,
  folder = "youtube-duplicate"
) => {
  try {
    if (!localFilePath) {
      return null;
    }

    configureCloudinary();

    const response = await cloudinary.uploader.upload(localFilePath, {
      folder,
      resource_type: "auto",
    });

    removeLocalFile(localFilePath);
    return response;
  } catch (error) {
    removeLocalFile(localFilePath);
    return null;
  }
};

const deleteFromCloudinary = async (publicId, resourceType = "image") => {
  try {
    if (!publicId) {
      return null;
    }

    configureCloudinary();

    return await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
    });
  } catch (error) {
    return null;
  }
};

export { deleteFromCloudinary, removeLocalFile, uploadOnCloudinary };
