import { asyncHandler } from "../utils/asyncHandler.js";
import { apiError } from "../utils/apiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { apiResponse } from "../utils/apiResponse.js";
import fs from 'fs';

const registerUser = asyncHandler(async (req,res) => {
    // res.status(200).json({
    //     message: "User registration Successful. "
    // });

    // get user details from frontend
    // validations - not empty
    // check if user already exists: using email, username
    // check for images, check for avatar
    // upload them to cloudnary
    // create user object - create entry in db
    // remove password and refresh token from response
    // check for user creation success
    // return response to frontend

    const { fullName, email, username, password } =req.body
    console.log("email: ", email);

    // Beginners way
    // if(fullName === "")
    // {
    //     throw new apiError(400, "Full name is required.")
    // }

    // Advanced way
    if(
        [fullName, email, username, password].some((field) => 
        field?.trim() === "")
    ){
        throw new apiError(400, "All fields are required. ");
    }

    // To check if the user already exists...
    // check in db using email or username
    const userExists = await User.findOne({
        $or: [{ username }, { email }] /* these are operators => (doller : $)or:[{},{}] */
    })

    // if user exists, throw error
    if(userExists) {
        throw new apiError(409, "User already exists with the given email or username. ");
    }

    // const avatarLocalPath = req.files?.avatar[0/* Object */]?.path;
    // const coverImageLocalPath = req.files?.coverImage[0]?.path;

    // console.log("req.files: ", req.files); // just for checking
    // console.log("avatarLocalPath: ", avatarLocalPath); // just for checking
    // console.log("coverImageLocalPath: ", coverImageLocalPath); // just for checking

    let avatarLocalPath;
    if (req.files && req.files.avatar && Array.isArray(req.files.avatar) && req.files.avatar.length > 0) {
        avatarLocalPath = req.files.avatar[0].path;
    }

    let coverImageLocalPath;
    if (req.files && req.files.coverImage && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0) {
        coverImageLocalPath = req.files.coverImage[0].path;
    }

    if(!avatarLocalPath) {
        // Clean up any uploaded cover image
        if (coverImageLocalPath && fs.existsSync(coverImageLocalPath)) {
            fs.unlinkSync(coverImageLocalPath);
        }
        throw new apiError (400, "Avatar file is required. ");
    }
    // Cover image is optional, no check needed


    // upload files to cloudinary
    const avatarImageUploadResponse = await uploadOnCloudinary(avatarLocalPath);
    const coverImageUploadResponse = coverImageLocalPath ? await uploadOnCloudinary(coverImageLocalPath) : null;

    // console.log("avatarImageUploadResponse: ", avatarImageUploadResponse); // just for checking
    // console.log("coverImageUploadResponse: ", coverImageUploadResponse); // just for checking

    if(!avatarImageUploadResponse) {
        throw new apiError (400, "Avatar file Upload Unsuccessful. ");
    }
    // Cover image upload is optional, no check if failed

    const user = await User.create({
        fullName,
        email,
        password,
        username: username.toLowerCase(), 
        avatar: avatarImageUploadResponse.url,
        coverImage: coverImageUploadResponse?.url || "",
    })

    // check if user creation is successful by findBbyId
    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )
    // check if user creation is successful
    if(!createdUser) {
        throw new apiError(500, "User registration unsuccessful. Please try again later.")
    }

    return res.status(201).json(
        new apiResponse(200, createdUser, "User registered successfully.")
    )
});

export { registerUser };