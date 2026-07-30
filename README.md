# Pitcher List Staff Content Dashboard

Internal Next.js 16 application for Pitcher List and QB List editorial work,
graphics, staff administration, WordPress synchronization, notifications, and
analytics. PostgreSQL, RLS, Storage, and durable operational state live in
Supabase; Vercel hosts the application and nine scheduled jobs.

## Local development

Requirements: Node.js 20+, npm, Docker Desktop, and the Supabase CLI installed
through this repository's locked dependencies.

```powershell
npm ci
Copy-Item .env.example .env.local
# Populate .env.local without committing or printing secret values.
npm run db:start
npm run dev
```

Open `http://localhost:3000`. Stop the local stack with `npm run db:stop`.

## Quality gate

```powershell
npm run lint
npm run typecheck
npm run test:coverage
npm run build
npm run test:database
npm run db:types:check
npm run db:lint
npm run test:browser
npm run test:quality
npm audit --audit-level=low
```

Test placement and CI behavior are documented in
[docs/TEST_ARCHITECTURE.md](docs/TEST_ARCHITECTURE.md).

## Production operations

Do not deploy from generic Vercel instructions. Database migrations and Vercel
deployments are separate release steps, and the current application stack
requires the database to be migrated first.

Start with [docs/runbooks/README.md](docs/runbooks/README.md), then use the
linked backup, migration, deployment, incident, and secret-rotation procedures.
The read-only readiness report is:

```powershell
npm run ops:preflight:production
```

Project progress and verified evidence live in
[docs/PROJECT_FINISH_CHECKLIST.md](docs/PROJECT_FINISH_CHECKLIST.md).
