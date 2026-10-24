# OCP Market

React/Vite frontend and PostgreSQL-backed multiplayer paper-trading server. All balances and trades in the public application are simulated.

## Local setup

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Configure your own `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `DATABASE_URL` and `PAPER_ALLOWED_ORIGINS`. Allowed origins must match the local URL. Never expose server credentials through `VITE_` variables or commit real environment files.

Clerk provides email-verification login. Each authenticated account receives100,000 virtual USD once. Public application information and privacy pages are available without login.

## Checks

```sh
npm test
npx tsc --noEmit
npm run build
```

Real PostgreSQL integration tests run only when `PAPER_TEST_DATABASE_URL` points to a disposable test database. Without it, those tests are skipped. Never use a production database for tests.

## Hosting

Deploy `frontend/` as a Vite project. Build with `npm run build` and publish `dist/`; the server API is `api/paper.ts`. The included Vercel configuration serves `explore.html` at the Market hostname root. Set authentication and database variables in the hosting environment.
