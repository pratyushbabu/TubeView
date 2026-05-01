import dotenv from "dotenv";
import mongoose from "mongoose";
import { validateEnv } from "./config/env.js";
import connectDB from "./db/index.js";

dotenv.config({
  path: "./.env",
});

const port = process.env.PORT || 8000;

const startServer = async () => {
  try {
    validateEnv();
    await connectDB();

    const { app } = await import("./app.js");
    const server = app.listen(port, () => {
      console.log(`Server is running at port ${port}`);
    });

    const shutdown = async (signal) => {
      console.log(`${signal} received. Shutting down gracefully...`);
      server.close(async () => {
        await mongoose.connection.close();
        process.exit(0);
      });
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    server.on("error", (error) => {
      console.error("Server error:", error);
      process.exit(1);
    });
  } catch (error) {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  }
};

startServer();
