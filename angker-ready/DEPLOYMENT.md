# Deployment (Vercel + managed PostgreSQL)

## Quick start (updated)
1. Set these variables in your host dashboard (values for the bot are already in the bundled `.env`): `DATABASE_URL`, `APP_URL` (https, no trailing slash), `APP_ENV=production`, `SESSION_SECRET`, `PROVIDER_ENCRYPTION_KEY`, `CRON_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_ADMIN_IDS`.
2. Deploy. **Build command must be `npm run build`** (see `vercel.json`) — plain `next build` skips the table creation and causes "Server error" on Create account / Login. Also set `DATABASE_URL` (and `DIRECT_URL` if your database uses a pooler). The build (`scripts/predeploy.mjs`) creates all database tables automatically (`prisma db push`) and seeds roles. No manual migration is needed any more.
3. When the server starts it registers the Telegram webhook by itself and sends the admin "✅ Website is online" with a database/webhook status.
4. Diagnose anything with: `curl -H "Authorization: Bearer $CRON_SECRET" $APP_URL/api/internal/setup` (re-registers the webhook, checks the database, messages the admin).
5. Only Telegram IDs in `TELEGRAM_ADMIN_IDS` (or the Admin table) get replies from the bot; everyone else is ignored silently.


Never put real secrets in Git. Set every variable in the hosting dashboard.

## 1. Repository
1. Create a **private** GitHub repository. 2. Push the project (`.env` is git-ignored). 3. Commit `prisma/migrations` after step 4.

## 2. Database
4. Create a PostgreSQL database (Neon, Supabase, Railway, …). Locally run `npx prisma migrate dev --name init` once and commit the generated `prisma/migrations`.
5. Collect **two** URLs: the **pooled** one → `DATABASE_URL`, the **direct** one → `DIRECT_URL` (same value if there is no pooler). On Vercel always use the pooled URL at runtime.
6. Apply migrations **manually, once per release** (never on function start): `DIRECT_URL=... DATABASE_URL=... npx prisma migrate deploy`, then `npx prisma db seed` the first time.

## 3. Secrets
7. Generate: `SESSION_SECRET` (`openssl rand -base64 32`), `PROVIDER_ENCRYPTION_KEY` (`openssl rand -base64 32`; **losing it makes stored provider keys unreadable**), `TELEGRAM_WEBHOOK_SECRET` and `CRON_SECRET` (`openssl rand -hex 32`).
8. `APP_URL` = your https URL, `APP_ENV=production`.

## 4. Telegram bot
9. In Telegram open **@BotFather** → `/newbot` → copy the token → `TELEGRAM_BOT_TOKEN`.
10. Get your numeric user ID: send any message to your new bot, then open `https://api.telegram.org/bot<TOKEN>/getUpdates` and read `message.from.id`.
11. `TELEGRAM_ADMIN_IDS=<id>[,<id2>]` (IDs only — usernames are never trusted). `db seed` turns them into Owners.
12. After the site is deployed, register the webhook:
```bash
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -d "url=$APP_URL/api/telegram/webhook" -d "secret_token=$TELEGRAM_WEBHOOK_SECRET" \
  -d 'allowed_updates=["message","callback_query"]'
```
Check with `getWebhookInfo`; `last_error_message` must be empty. The bot runs inside the Next.js app (serverless), so **no separate worker is needed** for it.

## 5. Provider and payments
13. Open the bot → **Provider API → Add Provider** and send `Name|https://provider/api/v2|API_KEY`. The bot deletes your message and stores the key encrypted. Press **Test / Balance**, then **Preview Sync**, then **Fetch Services**. Imported services start **disabled** — review prices, then enable them under Services.
14. ABA KHQR (khmer-system.com): set `ABA_API_BASE_URL`, `ABA_MERCHANT_ID`, `ABA_API_KEY`. Until all three exist the site shows "Payments unavailable". Each QR costs the merchant wallet a small fee, so keep it funded.
15. Min/max deposit, maintenance, registration and the ABA switch are changed in the bot under **Website Settings**.

## 6. Scheduler (required)
The outbox, order-status sync and deposit reconciliation run only when `GET /api/internal/worker` is called:
```bash
curl -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/internal/worker"
```
Call it **every minute**. Vercel Cron frequency depends on your plan (at the time of writing the free tier allowed only daily jobs — check the current Vercel docs). If your plan is too limited use an external scheduler (cron-job.org, GitHub Actions, a small VPS cron). Without it, orders are never sent to the provider.

## 7. Deploy
16. Import the repo in Vercel, add all variables, deploy. Build command `next build` (migrations are **not** run in it).
17. Redeploy after changing variables.

## Pre-launch verification
Do this with tiny real amounts before announcing:
1. `GET $APP_URL/api/public/settings` returns JSON. 2. Register, log out, log in; wrong password is rejected. 3. `/start` in the bot shows the dashboard; a second Telegram account gets no reply. 4. Add and test the provider; the balance shows. 5. Import services, enable one cheap service. 6. Deposit $1 through KHQR; the balance rises exactly once; the ledger shows one DEPOSIT. 7. Place a small order; it leaves PENDING after the next worker run and gets a provider reference. 8. Let one order fail or cancel; confirm the refund appears once. 9. Open a ticket, reply from the bot, see the reply on the site. 10. Toggle maintenance in the bot: the site shows the maintenance page, the bot still works.

## Operations
- **Backups:** enable automated backups / point-in-time recovery at your database provider and **test a restore**. Wallet data is accounting data: never delete users or orders.
- **Monitoring:** uptime check on `/api/public/settings`; alert on HTTP 5xx; watch the Vercel function logs. Useful queries:
  - stuck outbox: `SELECT count(*) FROM "OutboxEvent" WHERE "processedAt" IS NULL AND "createdAt" < now() - interval '10 minutes';`
  - unknown submits: `SELECT id FROM "Order" WHERE status='PROCESSING' AND "providerRef" IS NULL;` (reconcile in the bot: Orders)
  - unmatched payments: open the bot → Payments → Pending.
- **Key rotation:** rotate the ABA key and provider keys if they were ever shared; re-enter provider keys through the bot.

## 5. Log in with Telegram (customers)
1. Uses the same bot as `TELEGRAM_BOT_TOKEN` (optionally set `TELEGRAM_BOT_USERNAME`, otherwise it is detected automatically).
2. In **@BotFather** send `/setdomain` → choose your bot → enter your site domain exactly as customers see it (e.g. `panel.example.com`, no `https://`). Without this step the Telegram button shows "Bot domain invalid".
3. Run the database update (`npm run db:push`, done automatically on build): it adds `User.telegramId`.
4. The button appears on /login and /register. First-time Telegram users get an account + wallet automatically; returning users are matched by their Telegram ID.

## 6. Log in with Google (customers)
1. Go to https://console.cloud.google.com → **APIs & Services → OAuth consent screen** (External, fill app name + support email, publish) → **Credentials → Create credentials → OAuth client ID → Web application**.
2. Under **Authorized JavaScript origins** add your site address exactly (e.g. `https://panel.example.com`; add `http://localhost:15794` for local tests). No redirect URI is needed.
3. Copy the Client ID into `GOOGLE_CLIENT_ID` (host dashboard and `.env`) and redeploy. The database update (`telegramId`/`googleId` columns) runs automatically on build.
4. If a Google account's email already exists on the site, the two are linked automatically.
