# Guess Who Web App Backend - Agent Context

> Backend-specific context for Claude Code agents.
> For project-wide context, see `../.claude/CLAUDE.md`.

## Stack

NestJS 11 + TypeScript + MongoDB (Mongoose) + Google OAuth + Rollbar

## Project Structure

```text
src/
|-- auth/
|   |-- auth.controller.ts
|   |-- auth.service.ts
|   |-- auth.module.ts
|   |-- guards/
|   `-- strategies/
|-- users/
|-- rooms/
|-- invites/
|-- images/
|-- matches/
|-- realtime/
|-- common/
|   |-- decorators/
|   |-- filters/
|   |-- interceptors/
|   `-- pipes/
`-- main.ts
```

## Conventions

### Module Pattern

Each domain module should include:
- `*.module.ts` for DI wiring
- `*.controller.ts` for route handlers
- `*.service.ts` for business logic
- `dto/` for request validation and response contracts
- `schemas/` for Mongoose schema definitions

### Error Handling

- Throw typed Nest exceptions (`BadRequestException`, `ForbiddenException`, etc.) in services/controllers.
- Use a global exception filter to normalize responses into `{ error: { code, message, details } }`.
- Report unhandled errors to Rollbar with request metadata and redacted secrets.

### Validation

- Enable global `ValidationPipe` with `whitelist`, `forbidNonWhitelisted`, and transform enabled.
- Validate all mutation inputs with DTOs and class-validator.
- Add custom validators for board-size/image-count and invite constraints.

### Database Access

- Use Mongoose schemas with timestamps and explicit indexes.
- Keep schema-related logic in module services (no direct controller model access).
- Use transactions for multi-document match initialization and invite join flows where atomicity matters.

### Authentication & Guards

- OAuth module handles Google sign-in and user creation/linking.
- JWT or secure-session guard protects authenticated routes.
- Guest room token guard scopes non-authenticated players to specific room membership.
- Role checks use decorators (`@Roles('host')`) and guards.

## Build & Test Commands

| Command | Purpose |
| ---------------- | -------------------------- |
| `npm run build` | Compile TypeScript |
| `npm run start:dev` | Start dev server |
| `npm run lint` | Run linter |
| `npm run test` | Run unit tests |
| `npm run test:e2e` | Run e2e tests |

## Environment Variables

| Variable | Purpose | Required |
| ---------------- | -------------------------- | -------- |
| `PORT` | API port (default 3001) | N |
| `MONGODB_URI` | MongoDB connection string | Y |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | Y |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | Y |
| `GOOGLE_CALLBACK_URL` | OAuth callback URL | Y |
| `JWT_SECRET` | Token signing secret | Y |
| `JWT_EXPIRES_IN` | Access token TTL (e.g. `15m`) | Y |
| `ROLLBAR_ACCESS_TOKEN` | Rollbar server-side token | Y |
| `ROLLBAR_ENV` | Rollbar environment tag | Y |
| `FRONTEND_URL` | CORS allowed frontend origin | Y |
| `TEMP_ROOM_TTL_HOURS` | Temporary room inactivity TTL | Y |
| `MAX_UPLOAD_MB` | Per-image upload cap | Y |

## Implementation Status

| Module | Status | Notes |
| ---------------- | ------------- | -------------------- |
| `auth` | Not Started | |
| `users` | Not Started | |
| `rooms` | Not Started | |
| `invites` | Not Started | |
| `images` | Not Started | |
| `matches` | Not Started | |
| `realtime` | Not Started | |
