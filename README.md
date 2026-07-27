# Flinkout

Flinkout is a social fitness web app. It is a TypeScript monorepo with a Next.js frontend and an Express/MySQL API.

## Local setup

1. Copy `.env.example` to `apps/api/.env` and set a MySQL `DATABASE_URL` and long random `SESSION_SECRET`.
2. Copy the frontend URL setting to `apps/web/.env.local` if the API is not at the default URL.
3. Run `npm install`, `npm run db:generate`, and `npm run db:migrate`.
4. Run `npm run dev`.

The frontend is available on port 3000 and the API on port 4000.
