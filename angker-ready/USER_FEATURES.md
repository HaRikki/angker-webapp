# AngKer SMM — User Features (Strengthened)

## Authentication
| Feature | Status | Endpoint / Path |
|---------|--------|-----------------|
| Register | ✅ | `POST /api/auth/register` · `/register` |
| Login | ✅ | `POST /api/auth/login` · `/login` |
| Logout | ✅ | `POST /api/auth/logout` |
| Forgot Password | ✅ | `POST /api/auth/forgot-password` · `/forgot-password` |
| Reset Password | ✅ | `POST /api/auth/reset-password` · `/reset-password?token=` |
| Email Verification | ✅ | `POST /api/auth/request-verify` · `POST/GET /api/auth/verify-email` |
| Change Password | ✅ | `PATCH /api/user/profile` · Profile page |
| Session list / revoke | ✅ | `GET/DELETE /api/user/sessions` |
| Rate limiting | ✅ | Login, register, forgot, orders, deposits |
| Password hashing | ✅ | scrypt (N=16384) |
| Validation | ✅ | Username 3–20 alnum/_, email, password 8+ with upper/lower/digit |

**Notes**
- Forgot password always returns `{ ok: true }` (no email enumeration).
- In non-production, `resetUrl` / `verifyUrl` is returned for testing (no SMTP required).
- Password change invalidates all sessions.

## Dashboard (`GET /api/user/dashboard`)
- Balance, total/pending/completed/failed orders
- Total spent, deposits, refunds
- Recent orders & transactions
- Announcements & notifications
- Account info + active session count

## Service Catalog (`GET /api/public/services`)
- Categories, search (`q`), filter by category
- Sort: name, price_asc, price_desc, newest
- Only active, non-archived services
- Server-side sell price only
- Favorites: `GET/POST/DELETE /api/user/favorites`

## New Order
1. Platform / category / service selection
2. Target URL or username
3. Quantity (min/max from service)
4. Optional coupon code
5. Server computes price (per 1000)
6. Review → confirm
7. Idempotency key + ledger debit + outbox worker to provider
8. Duplicate request blocked; insufficient balance blocked

## Order Management
- List with status filter, search, date range
- Detail + timeline (events) + refund history
- Status labels safe for public display
- Provider updates via background worker

## Add Funds (ABA KHQR)
- Min/max from site settings
- Unique payment reference
- QR / pay URL / expiry
- Status poll: `GET /api/payments/[reference]/status`
- Credit only after ABA verifies PAID + amount match
- Atomic transaction + unique ledger reference
- Notification on success
- Cron reconcile for abandoned pending deposits

## Payment Security
- No screenshot / self-claim credit
- Amount mismatch → no credit + admin alert
- Row lock + status check prevents double credit
- Rate limits on QR creation and status polls
