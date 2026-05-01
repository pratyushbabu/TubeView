const requiredEnvironmentVariables = [
  "ACCESS_TOKEN_SECRET",
  "ACCESS_TOKEN_EXPIRY",
  "REFRESH_TOKEN_SECRET",
  "REFRESH_TOKEN_EXPIRY",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
];

const validateEnv = () => {
  const missingVariables = requiredEnvironmentVariables.filter(
    (key) => !process.env[key]
  );

  if (!process.env.MONGODB_URI && !process.env.MONGODB_URL) {
    missingVariables.push("MONGODB_URI or MONGODB_URL");
  }

  if (missingVariables.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVariables.join(", ")}`
    );
  }
};

export { validateEnv };
