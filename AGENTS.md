# LEKKER-APP-CHAT (Lekker Chat)

## Session start

1. Read `../1. start here/KNOWLEDGE_HUB.md`
2. Read `../user knowledge/infra/LEKKER-CHAT.md` — full product + engineering reference
3. Read `replit.md` for stack, routes, env vars
4. iOS App Store: `IOS-PRODUCTION-READINESS.md` + `APP_STORE_COMPLIANCE.md` (rejections / resubmission)
5. `../user knowledge/narrative/IDEA-TO-CODE.md` — Lekker Chat ↔ lekker.network

## What this is

Expo React Native mobile app (iOS + Android) — messaging, CledwynAI, Lekkerpreneur directory, social feed. Backend is Express + PostgreSQL (**Neon**, centralized with lekker.network) deployed on Replit.

- **Package / bundle:** `com.lekker.chat` (iOS + Android)
- **Google Play:** [Lekker](https://play.google.com/store/apps/details?id=com.lekker.chat) — listing name differs from app display name
- **GitHub:** `Digital-Studio-Hub/LEKKER-APP-CHAT`
- **Infra:** `../user knowledge/infra/LEKKER-INFRA.md`

## Local paths

| Purpose | Path |
|---------|------|
| Ecosystem / iCloud sync | `../LEKKER-APP-CHAT/` (this repo) |
| **Xcode / iOS builds** | `~/Projects/LEKKER-APP-CHAT` — required; iCloud path has spaces and breaks Expo Constants build scripts |

## iOS setup (verified 2026-06-26)

```bash
# One-time (use ~/Projects — not iCloud path)
cd ~/Projects/LEKKER-APP-CHAT
npm install
npx expo prebuild --platform ios
export SSL_CERT_FILE=/opt/homebrew/etc/ca-certificates/cert.pem  # if pod install SSL fails
cd ios && pod install

# Build simulator
npx expo run:ios -d "iPhone 17 Pro"
# Or open ios/LekkerChat.xcworkspace in Xcode
```

**Requirements:** Xcode 26+, CocoaPods (`brew install cocoapods`), Node 23+

`ios/` and `android/` are gitignored — regenerate with `expo prebuild` after clone.

## Local `.env`

Copy `.env.example` → `.env` in **`~/Projects/LEKKER-APP-CHAT`** (not iCloud path).

| Variable | Required | Purpose |
|----------|----------|---------|
| `EXPO_PUBLIC_DOMAIN` | Yes (mobile) | API host — `localhost:5000` for simulator + local server |
| `EXPO_PUBLIC_API_URL` | Optional | Full URL override (e.g. Replit backend, no local server) |
| `DATABASE_URL` | Yes (server) | Neon **pooled** connection string (Replit Secrets + local `.env`) |
| `SESSION_SECRET` | Yes (server) | JWT signing — pre-filled in `.env`; rotate for production |
| `LEKKER_NETWORK_API_KEY` | For directory sync | From Replit Secrets |
| `LEKKER_WORKSPACE_ID` / `LEKKER_TOKEN` | Connect API | From lekker.network workspace settings |

```bash
# Terminal 1 — backend (needs Neon DATABASE_URL)
cd ~/Projects/LEKKER-APP-CHAT && npm run server:dev

# Terminal 2 — Metro / iOS
cd ~/Projects/LEKKER-APP-CHAT && npx expo run:ios -d "iPhone 17 Pro"

# Android production build (EAS cloud — no local SDK)
eas build --platform android --profile production
```

**Mobile-only (no local DB):** set `EXPO_PUBLIC_API_URL=https://YOUR-REPLIT-SLUG.replit.app:5000` and skip `server:dev`.

After changing `app.json` ATS settings, re-run `npx expo prebuild --platform ios` if native project is stale.

## Relationship to lekker.network

- Syncs users/directory via `server/lekkerNetwork.ts`
- Connect API for workspace CRM/forms
- NYCEE and other verticals use Connect on lekker.network; Lekker Chat is the **mobile social layer**