# YouTube Duplicate Backend

Express, MongoDB, Cloudinary, JWT, and Multer backend for a YouTube-style video API.

## Features

- User registration with avatar and optional cover image upload
- Login, logout, access-token refresh, password change, and current-user endpoints
- Account, avatar, and cover image updates
- Public channel profile and authenticated watch history
- Video upload, listing, detail view, update, delete, and publish/unpublish toggle
- JSON error responses, 404 handler, health checks, CORS, cookie auth, and graceful shutdown
- Smoke tests for deploy-critical API behavior

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env` from `.env.example` and fill in real values:

```bash
cp .env.example .env
```

3. Start MongoDB locally or set `MONGODB_URI` to your hosted MongoDB connection string.

4. Run the development server:

```bash
npm run dev
```

## Scripts

```bash
npm start
npm run dev
npm test
npm run format
npm run format:check
npm run check
```

## Base Routes

- `GET /` - API root status
- `GET /api/v1/healthcheck` - health check
- `POST /api/v1/user/register`
- `POST /api/v1/user/login`
- `POST /api/v1/user/logout`
- `POST /api/v1/user/refresh-token`
- `POST /api/v1/user/change-password`
- `GET /api/v1/user/current-user`
- `PATCH /api/v1/user/update-account`
- `PATCH /api/v1/user/avatar`
- `PATCH /api/v1/user/cover-image`
- `GET /api/v1/user/c/:username`
- `GET /api/v1/user/history`
- `GET /api/v1/videos`
- `POST /api/v1/videos`
- `GET /api/v1/videos/:videoId`
- `PATCH /api/v1/videos/:videoId`
- `DELETE /api/v1/videos/:videoId`
- `PATCH /api/v1/videos/toggle/publish/:videoId`

`/api/v1/users/*` is also supported as an alias for `/api/v1/user/*`.

## Deployment Notes

- Set `NODE_ENV=production`.
- Set `CORS_ORIGIN` to the deployed frontend origin. Multiple origins can be comma-separated.
- Set strong `ACCESS_TOKEN_SECRET` and `REFRESH_TOKEN_SECRET` values.
- Use a hosted MongoDB connection string in `MONGODB_URI`.
- Configure Cloudinary credentials for file uploads.
- Keep `public/temp` as scratch space only; uploaded temp files are gitignored.
