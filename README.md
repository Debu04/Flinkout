# Flinkout

Flinkout is a social fitness web app built as one modular Next.js application
with Prisma and MySQL. Pages and `/api/v1` Route Handlers run in one Node.js
process, while database access, sessions, policies, and domain logic remain in
server-only modules.

## Local setup

1. Copy `.env.example` to `.env.local` and set a MySQL `DATABASE_URL` and a long random `SESSION_SECRET`.
2. Run `npm install`.
3. Run `npm run db:migrate`.
4. Run `npm run dev`.

The website and API are both available on port 3000. API routes remain stable
under `http://localhost:3000/api/v1`.

## Production deployment

The Hostinger Business deployment uses one Node.js website connected to the
GitHub production branch. It installs, migrates, builds, and starts from the
repository root.

See [HOSTINGER_DEPLOYMENT.md](./HOSTINGER_DEPLOYMENT.md) for the branch,
environment variable, build, migration, and verification checklist.
