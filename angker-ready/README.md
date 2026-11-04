# AngKer SMM Panel

Social-media-marketing reseller platform. Customers use the website (Khmer / English, dark / light); **the admin runs everything from a Telegram bot** — there is no admin panel on the website.

> **Status:** code-complete for the scope below, but it has **not been compiled, migrated or tested in the environment that produced it** (no network there). Run the checklist in [DEPLOYMENT.md](DEPLOYMENT.md#pre-launch-verification) before taking real money.

## Features
- **Website:** landing, register/login, dashboard, service catalog, new order (review + confirm), order history/detail, add funds (ABA KHQR), transactions, support tickets, profile/password, maintenance page.
- **Telegram admin bot:** overview, services & categories, provider API (encrypted keys, test, preview/import), orders (refresh, reconcile unknown submits), users (suspend, balance adjustment), payments, tickets, settings, sales report, audit log. Roles: Owner / Finance / Support / Service Manager.
- **Money safety:** immutable wallet ledger, row-locked balance changes, idempotent orders, exactly-once refunds, payments credited only after provider verification with an amount match.

## Stack
Next.js 14 (App Router) · TypeScript · Tailwind · PostgreSQL + Prisma · scrypt · Telegram Bot API (webhook) · Vitest.

## Architecture
```
Browser ──> Next.js pages + /api/*  ──┐
Telegram ─> /api/telegram/webhook ────┼──> src/server/* (orders, wallet, payments, providers, bot) ──> PostgreSQL
Scheduler ─> /api/internal/worker ────┘        │
                                               ├── SMM provider (adapter, server side only)
                                               └── ABA KHQR API (khmer-system.com)
```
The worker endpoint drains the **outbox** (order submission, notifications), syncs order status and reconciles pending deposits. It must be called on a schedule (see DEPLOYMENT.md).

## Local development
```bash
npm install
cp .env.example .env            # fill in values (see comments in the file)
npx prisma migrate dev --name init   # creates prisma/migrations (commit it) and the tables
npx prisma db seed              # roles, default categories, owner admins from TELEGRAM_ADMIN_IDS
npm run dev
```
For the bot locally, expose the dev server over HTTPS (any tunnel) and register the webhook as in DEPLOYMENT.md.

## Tests
Tests run against a **real PostgreSQL database** and `TRUNCATE` every table, so use a dedicated empty one whose name contains `test`:
```bash
createdb angker_test
export TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/angker_test
DATABASE_URL=$TEST_DATABASE_URL DIRECT_URL=$TEST_DATABASE_URL npx prisma migrate deploy   # or: prisma db push
npm test
```
Covered: registration, login, brute-force limit, authorization and user-data isolation, service availability, order creation, insufficient balance, concurrent deduction, duplicate orders, provider failure (definite vs. unknown), refunds, payment verification, duplicate/concurrent payment confirmation, ledger integrity, Telegram secret/allowlist/roles/callback validation, balance-adjustment audit, ticket permissions, provider sync idempotency. The provider and payment gateway are **mocked in tests only**; no mock code is reachable in production.

## Scripts
`dev` · `build` · `start` · `test` · `typecheck` (app only; tests are excluded so they can never break `next build`) · `typecheck:tests` · `db:generate` · `db:migrate:dev` · `db:migrate:deploy` · `db:seed`

## Known limitations
- Forgot-password, e-mail verification, ticket file uploads, API access for users, coupons/announcements/broadcast management in the bot, Bakong KHQR (separate from the ABA gateway) and provider cancel/refill are **not implemented**.
- ABA payments go through a third-party gateway (khmer-system.com), not ABA PayWay directly; its answers are trusted after the amount check.
- Rate limiting trusts `X-Forwarded-For`; deploy behind a platform that sets it.
- Notifications for users are stored but not yet shown on the website.
- Khmer translations were written without native review.
