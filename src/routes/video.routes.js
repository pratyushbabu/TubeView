import { Router } from "express";
import {
  deleteVideo,
  getAllVideos,
  getVideoById,
  publishVideo,
  togglePublishStatus,
  updateVideo,
} from "../controllers/video.controller.js";
import {
  optionalVerifyJWT,
  verifyJWT,
} from "../middlewares/auth.middleware.js";
import { upload } from "../middlewares/multer.middleware.js";

const router = Router();

router
  .route("/")
  .get(getAllVideos)
  .post(
    verifyJWT,
    upload.fields([
      {
        name: "videoFile",
        maxCount: 1,
      },
      {
        name: "thumbnail",
        maxCount: 1,
      },
    ]),
    publishVideo
  );

router.route("/toggle/publish/:videoId").patch(verifyJWT, togglePublishStatus);

router
  .route("/:videoId")
  .get(optionalVerifyJWT, getVideoById)
  .patch(
    verifyJWT,
    upload.fields([
      {
        name: "thumbnail",
        maxCount: 1,
      },
    ]),
    updateVideo
  )
  .delete(verifyJWT, deleteVideo);

export default router;
