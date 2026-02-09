# Guess Who Web App - Backend

Backend API for the Guess Who Web App. This service manages Google authentication, room lifecycle, invite flows, image uploads, and multiplayer match state.

## Tech Stack

- NestJS + TypeScript
- MongoDB
- Google OAuth 2.0
- Rollbar

## Architecture Overview

Planned domain modules:

- `auth`: Google login and session handling
- `users`: player profile access
- `rooms`: room create/update/archive and membership
- `invites`: link/code generation, validation, join
- `images`: photo upload and metadata
- `matches`: board generation, hidden targets, turns, guesses
- `realtime`: websocket presence and match updates

## Prerequisites

- Node.js 20+
- npm 10+
- MongoDB instance
- Google OAuth client credentials
- Rollbar project token

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env` in this directory:

```env
PORT=3001
MONGODB_URI=mongodb://localhost:27017/guess-who
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:3001/api/auth/google/callback
JWT_SECRET=replace_with_secure_secret
JWT_EXPIRES_IN=15m
FRONTEND_URL=http://localhost:3000
ROLLBAR_ACCESS_TOKEN=your_rollbar_server_token
ROLLBAR_ENV=development
TEMP_ROOM_TTL_HOURS=24
MAX_UPLOAD_MB=10
```

3. Start development server:

```bash
npm run start:dev
```

## API Summary

Base path: `/api`

Core endpoint groups:

- `/api/auth/*` - Google auth and session endpoints
- `/api/rooms/*` - room management and membership
- `/api/rooms/:roomId/images/*` - image uploads and image inventory
- `/api/rooms/:roomId/invites/*` and `/api/invites/:code/*` - invite management and join
- `/api/rooms/:roomId/matches/*` - match setup and gameplay actions

See `.claude/PRD.md` for full endpoint and schema specs.

## Development Workflow

```bash
# compile
npm run build

# start in watch mode
npm run start:dev

# lint
npm run lint

# unit tests
npm run test

# e2e tests
npm run test:e2e
```

## Notes

- Match initialization validates `imageCount >= boardSize * boardSize`.
- Minimum images required to start a match: `16`.
- Temporary rooms are expected to expire after inactivity based on `TEMP_ROOM_TTL_HOURS`.
