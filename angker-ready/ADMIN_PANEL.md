# AngKer SMM — Admin Panel

## What was added

### Authentication & Security
- Web admin login at `/admin/login` (separate from user sessions)
- Secure HTTP-only cookie sessions (8h expiry)
- Rate limiting on login (10 attempts / 15 min per IP)
- Role-based permissions: OWNER, FINANCE, SUPPORT, SERVICE_MANAGER
- Backend permission checks on every admin API
- Change password at `/admin/settings`
- Audit log for login/logout and all critical actions

### Default Admin Account (after seed)
- **Username:** `admin`
- **Password:** `Admin@12345`
- **Role:** OWNER

Change this password immediately after first login.

### Modules (Backend + UI)
| Module | Path | API |
|--------|------|-----|
| Dashboard | `/admin/dashboard` | `GET /api/admin/dashboard` |
| Payments | `/admin/payments` | `GET/POST /api/admin/payments` |
| Balance | `/admin/balance` | `GET/POST /api/admin/balance` |
| SMM Providers | `/admin/providers` | `GET/POST /api/admin/providers` |
| Services | `/admin/services` | `GET/POST /api/admin/services` |
| Packages | `/admin/packages` | `GET/POST /api/admin/packages` |
| Audit Logs | `/admin/audit` | `GET /api/admin/audit` |
| Settings | `/admin/settings` | change-password |

### Database changes
- `Admin`: added username, email, passwordHash, displayName, lastLoginAt (telegramId optional)
- `AdminSession`: new table for web sessions
- `AuditLog`: adminId support (telegram still works)
- `Package`: new model for service packages
- `DepositStatus`: added VERIFYING, REVIEW_REQUIRED

### Security rules enforced
- Cannot mark payment Completed without verification evidence
- Balance adjustments use wallet ledger + unique reference (no double credit)
- Cannot drive balance negative
- API keys encrypted at rest; never returned full to browser
- Soft-archive for services/packages with history
- Regular users cannot access `/api/admin/*` (separate session cookie)

## Setup

```bash
cd angker-ready
cp .env.example .env   # fill DATABASE_URL, SESSION_SECRET, PROVIDER_ENCRYPTION_KEY
npm install
npx prisma db push     # apply schema (does not wipe data)
npm run db:seed        # creates roles + admin user
npm run dev
```

Open `http://localhost:3000/admin/login`

## Production notes
1. Run `npx prisma db push` or create a migration — do **not** reset the database.
2. Seed once to create the web admin if it does not exist.
3. Rotate the default admin password.
4. Ensure `PROVIDER_ENCRYPTION_KEY` and `SESSION_SECRET` are set.

## Testing checklist
- [ ] Admin login / logout / session expiry
- [ ] User cannot call `/api/admin/*`
- [ ] Dashboard numbers match DB
- [ ] Payment list + mark review (with reason)
- [ ] Add / deduct balance + ledger entry + audit
- [ ] Deduct more than balance → error
- [ ] Add provider, test connection, fetch & import services
- [ ] Create / edit / enable-disable service
- [ ] Create / edit package linked to service
- [ ] Audit log shows actions
