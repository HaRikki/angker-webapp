=== AngKer Telegram Mini App ===
Build: MINIAPP-2026-10-21

Changes vs old website:
- NO login/register pages (redirect to /)
- Auth = Telegram WebApp initData only (/api/auth/webapp)
- UI = bottom navigation row (mobile Mini App style)
- Bot /start opens Mini App button

Deploy options:
1) Upload ONLY main.py  → it unpacks Mini App into ./angker-ready automatically
2) Upload this whole folder + main.py

After upload on host:
  rm -f angker-ready/.zip-applied   # force re-unpack if needed
  python3 main.py

Required .env:
  TELEGRAM_BOT_TOKEN=...
  APP_URL=https://YOUR-HTTPS-DOMAIN
  TELEGRAM_WEBHOOK_SECRET=...
  TELEGRAM_ADMIN_IDS=...
  DATABASE_URL=...
  SESSION_SECRET=...
  PROVIDER_ENCRYPTION_KEY=...
  CRON_SECRET=...

Verify Mini App is live:
  open https://YOUR-DOMAIN/MINIAPP_VERSION.txt  → should show MINIAPP-2026-10-21
  open https://YOUR-DOMAIN/  → should NOT show login form
  open from Telegram bot /start → Mini App button
