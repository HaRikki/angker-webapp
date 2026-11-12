# HaRikKi Shop — Telegram Mini App

Full working Mini App integrated with the existing Bot database, balance, orders, SMM services, Digital Store, KHQR/ABA payments, and tickets.

## Architecture

```
HaRikKi_Complete/
├── webapp.py          # FastAPI: API + static Mini App
├── api/auth.py        # Telegram WebApp initData validation
├── miniapp/
│   ├── index.html
│   ├── css/style.css
│   └── js/            # api.js, app.js, i18n.js
├── database.py        # REUSED (same SQLite)
├── payment_client.py  # REUSED
├── bot.py             # Unchanged bot logic
└── ndsmmsbot.db
```

**No separate database.** Mini App reads/writes the same `ndsmmsbot.db`.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/user` | Current user (balance, orders count) |
| POST | `/api/user/lang` | Set language `km` / `en` |
| GET | `/api/services` | Platforms + services + packages |
| GET | `/api/service/{id}` | Service detail + packages |
| POST | `/api/order` | Create SMM order (deduct balance + SMM API) |
| GET | `/api/orders` | User orders (`?status=`) |
| GET | `/api/order/{id}` | Order detail (SMM or digital) |
| GET | `/api/wallet` | Balance + deposit history |
| POST | `/api/deposit` | Create KHQR/ABA payment |
| GET | `/api/deposit/{id}/status` | Poll payment + auto-credit |
| GET | `/api/products` | Digital products + stock |
| GET | `/api/product/{id}` | Product detail |
| POST | `/api/products/buy` | Buy digital (balance + deliver key) |
| GET | `/api/digital-orders` | Digital order history |
| GET/POST | `/api/tickets` | List / create tickets |

All authenticated endpoints require header:

```
X-Telegram-Init-Data: <Telegram.WebApp.initData>
```

Server validates HMAC with `BOT_TOKEN`. Never trusts client-sent user_id / balance / price.

## Environment Variables

Same as bot, plus optional:

| Variable | Required | Description |
|----------|----------|-------------|
| `BOT_TOKEN` | ✅ | Used for initData validation |
| `ADMIN_ID` | ✅ | Bot admin |
| `PORT` | | Web port (default 8000, Railway/Render set automatically) |
| `DB_PATH` | | Default `ndsmmsbot.db` |
| `MINI_APP_PUBLIC_URL` | | Public HTTPS URL of this web service (also settable in Admin Panel) |
| Payment / SMM keys | | Same as existing bot `.env` / Admin Panel settings |

## Local Run

```bash
pip install -r requirements.txt
# Terminal 1 — Bot
python bot.py
# Terminal 2 — Mini App API + UI
python webapp.py
# Open http://localhost:8000 (must open via Telegram for real auth)
```

For local testing of auth without Telegram, you can temporarily relax validation (not for production).

## Deploy

### Railway / Render

1. Deploy the same project.
2. Add a **Web** service with start command: `python webapp.py`
3. Keep the **Worker** for `python bot.py` (or run both if your host allows).
4. Set env vars: `BOT_TOKEN`, `ADMIN_ID`, payment keys, etc.
5. Note the public HTTPS URL, e.g. `https://your-app.up.railway.app`

### Connect to Telegram Bot

1. Open Bot → Admin Panel → look for Mini App URL setting  
   **or** set env `MINI_APP_PUBLIC_URL=https://your-app.up.railway.app`
2. In Admin / settings DB key:
   - `mini_app_enabled` = `1`
   - `mini_app_url` = `https://your-app.up.railway.app`
3. Users who open the bot will see **Open Mini App** button (WebApp).
4. BotFather → Bot Settings → Menu Button / Configure Mini App (optional) → set same URL.

```python
# Already in bot.py — sends WebApp button when enabled
InlineKeyboardButton("📥 Open Mini App", web_app=WebAppInfo(url=mini_url))
```

## Features Covered

- ✅ Home (balance, stats, popular, quick nav)
- ✅ SMM Services (platforms, search, packages, order flow)
- ✅ Digital Store (products, stock, buy, keys + copy)
- ✅ Wallet (balance, KHQR/ABA deposit, poll status, history)
- ✅ Orders (filter by status, detail)
- ✅ Account (profile, lang KM/EN, dark/light)
- ✅ Support tickets
- ✅ Bottom nav mobile-first
- ✅ Telegram theme + initData auth
- ✅ Same DB / balance / orders as bot

## Security Notes

- Bot token, API keys, payment secrets stay **server-side only**
- Every mutating action re-checks balance and prices on server
- initData must be valid and fresh

## Test Checklist

1. [ ] Open Mini App from Telegram bot button
2. [ ] Home shows correct balance & username
3. [ ] Browse SMM services / platforms
4. [ ] Place SMM order → balance deducted → appears in Orders
5. [ ] Digital product buy → key delivered → copy works
6. [ ] Create deposit → QR shown → pay → status Success → balance updated
7. [ ] Create support ticket
8. [ ] Switch language KM ↔ EN
9. [ ] Dark / Light theme
10. [ ] Orders created in Mini App visible in Bot Order History (same DB)

## Files Added / Modified

**Added:**
- `webapp.py`
- `api/auth.py`
- `api/__init__.py`
- `miniapp/index.html`
- `miniapp/css/style.css`
- `miniapp/js/api.js`
- `miniapp/js/app.js`
- `miniapp/js/i18n.js`
- `MINIAPP.md`

**Modified:**
- `requirements.txt` (fastapi, uvicorn, pydantic)
- `Procfile` (web + worker)

**Unchanged:** bot.py, database.py, payment_client.py, existing features.
