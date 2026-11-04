# Google Login Setup

User can sign in / register with Google on `/login` and `/register`.

## How it works
1. Frontend loads Google Identity Services (GIS) button when `GOOGLE_CLIENT_ID` is set.
2. User picks a Google account → GIS returns an ID token (JWT).
3. Frontend sends token to `POST /api/auth/google`.
4. Server verifies signature (Google JWKS), audience, issuer, expiry, and `email_verified`.
5. If `googleId` exists → log in that user.
6. Else if email matches an existing user → link Google to that account (and mark email verified).
7. Else → create a new user (username from email prefix), wallet, session.
8. Redirect to `/dashboard`.

## Google Cloud Console setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials.
2. Configure **OAuth consent screen** (External or Internal).
3. Create **OAuth client ID** → Application type: **Web application**.
4. Under **Authorized JavaScript origins** add:
   - `http://localhost:3000` (dev)
   - `https://your-domain.com` (production = same as `APP_URL`)
5. Copy the **Client ID** (looks like `xxxxx.apps.googleusercontent.com`).

## Project config

In `.env`:

```
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
APP_URL=https://your-domain.com
```

Restart the app. The Google button appears on Login and Register pages.

Leave `GOOGLE_CLIENT_ID` empty to hide the button.

## Security notes
- ID token is verified server-side (RSA signature + claims). Client is never trusted alone.
- Unverified email accounts that match a Google email get password rotated and sessions cleared before Google is linked (prevents account takeover via unverified registration).
- Rate limited: 30 attempts / 15 min per IP.
