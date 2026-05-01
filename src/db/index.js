import mongoose from "mongoose";
import { DB_NAME } from "../constants.js";

const buildMongoUri = () => {
  const connectionString = process.env.MONGODB_URI || process.env.MONGODB_URL;

  if (!connectionString) {
    throw new Error("MONGODB_URI or MONGODB_URL is required");
  }

  const [uriWithoutQuery, query] = connectionString.split("?");
  const protocolSeparatorIndex = uriWithoutQuery.indexOf("://");
  const pathStartIndex = uriWithoutQuery.indexOf(
    "/",
    protocolSeparatorIndex + 3
  );
  const hasDatabaseName =
    pathStartIndex !== -1 &&
    uriWithoutQuery.slice(pathStartIndex + 1).trim().length > 0;

  if (hasDatabaseName) {
    return connectionString;
  }

  const normalizedUri = `${uriWithoutQuery.replace(/\/$/, "")}/${DB_NAME}`;
  return query ? `${normalizedUri}?${query}` : normalizedUri;
};

const connectDB = async () => {
  const connectionInstance = await mongoose.connect(buildMongoUri(), {
    serverSelectionTimeoutMS: 10000,
  });

  console.log(`MongoDB connected: ${connectionInstance.connection.host}`);
};

export default connectDB;
