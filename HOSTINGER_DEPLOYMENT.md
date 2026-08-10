# Hostinger Business deployment

Flinkout deploys as one Next.js Node.js website. Pages, server-only business
logic, Prisma, and `/api/v1` Route Handlers all run in the same process on the
main domain.

Replace `example.com` below with the real domain before configuring hPanel.

## 1. Release branch

The repository currently uses `master` as its production branch. Hostinger
must watch `master` unless the repository is intentionally renamed to `main`
first.

Use this release flow:

1. Develop and test on `ui-design`.
2. Open a pull request from `ui-design` into the production branch.
3. Review and merge only after tests and the production build pass.
4. Hostinger automatically deploys the one application from that commit.

Do not point Hostinger at `ui-design`; otherwise every development push becomes
a production deployment.

## 2. Create the database

In hPanel, open **Databases -> MySQL Databases** and create a database, user,
and strong password. Keep the credentials out of GitHub.

Build the Prisma connection string using the host shown by hPanel:

```text
mysql://DATABASE_USER:URL_ENCODED_PASSWORD@DATABASE_HOST:3306/DATABASE_NAME
```

Characters such as `@`, `:`, `/`, `#`, and `%` in the password must be URL
encoded inside `DATABASE_URL`.

## 3. Deploy the single Next.js application

Create one **Node.js Web App** for the main domain and import the GitHub
repository.

| Setting | Value |
| --- | --- |
| Branch | `master` |
| Root directory | repository root (`.` or blank) |
| Framework | Next.js |
| Node.js version | 22.x |
| Build command | `npm run build:hostinger` |
| Start command | `npm start` |
| Output directory, if requested | `.next` |

Add these environment variables in hPanel before the first build:

```text
NODE_ENV=production
DATABASE_URL=mysql://DATABASE_USER:URL_ENCODED_PASSWORD@DATABASE_HOST:3306/DATABASE_NAME
SESSION_SECRET=PASTE_A_RANDOM_SECRET_WITH_AT_LEAST_32_CHARACTERS
APP_ORIGIN=https://example.com
```

`npm run build:hostinger` generates Prisma Client, applies committed migrations
with `prisma migrate deploy`, and builds Next.js. A failed migration stops the
deployment instead of starting the app against an outdated schema.

The API is same-origin. Do not configure `API_ORIGIN`, an API subdomain, or
`NEXT_PUBLIC_API_URL`.

After deployment, verify:

```text
https://example.com/api/v1/health
```

It must return `{"status":"ok"}`.

## 4. GitHub automatic deployment

Connect only this one Node.js website to the production branch. A merge into
that branch should trigger one install/build/restart cycle. Keep development on
`ui-design`; do not point Hostinger automatic deployment at that branch.

## 5. Production verification

1. Open `https://example.com` and confirm HTTPS is active.
2. Open `/api/v1/health` and confirm it returns `{"status":"ok"}`.
3. Register a test account and refresh the page.
4. Sign out and sign back in.
5. Edit the profile and confirm the change remains after refresh.
6. Start a private test activity on a phone, allow GPS/motion access, finish it,
   choose **Save privately**, and verify the local/sync status.
7. Confirm the activity appears after another refresh or sign-in.
8. Use a second test account to confirm private profiles, activities, and routes
   are not visible.
9. Open hPanel deployment logs and confirm the expected commit was deployed.
10. Open phpMyAdmin and confirm the Prisma migration table and test data exist.

If deployment fails, do not merge another change on top of it. Open the
deployment log, fix the first error, and redeploy the same commit.
