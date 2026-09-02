# Lekker Chat — Handover Document

**Date:** 2026-07-05  
**Prepared by:** Grok (Digital Studio Hub agent session)  
**Repo:** `Digital-Studio-Hub/LEKKER-APP-CHAT`  
**Canonical build path:** `~/Projects/LEKKER-APP-CHAT`  
**Latest commit:** P3 — *push notifications + Connect API routes*  
**Prior:** `049b5ab` (P2 feed + mail compose), `979ef25` (Replit API URL), `e6da2c4` (synergy)

---

## Executive summary

Lekker Chat has been upgraded from a password-based messaging app to a **passwordless, ecosystem-connected mobile product**. Users sign in with **WhatsApp OTP** (phone + one-time code). New users add a **display name** only. The app now exposes **role-based tabs** tied to lekker.network identity: everyone gets Directory, Newsfeed, and Browse; verified lekkerpreneurs get Software (full lekker.network dashboard via SSO WebView); lekkerpreneurs with active workspace email get a **native Mail inbox**.

This build is **iOS build 5** (`app.json` → `buildNumber: "5"`). Build 5 adds App Store rejection fixes (contacts consent, EULA checkbox, content filter). Supersedes build 4.

---

## What was done (5-phase synergy plan)

### Phase 1 — WhatsApp OTP auth ✅

| Item | Location |
|------|----------|
| Send OTP | `POST /api/auth/whatsapp/send-code` |
| Verify + register/login | `POST /api/auth/whatsapp/verify` |
| Twilio WhatsApp sender | `server/whatsapp-otp.ts` |
| Phone normalisation | `shared/mobile-utils.ts` |
| Placeholder email/username for phone-only users | `phoneToPlaceholderEmail`, `phoneToUsername` |
| Nullable `passwordHash` | `shared/schema.ts` |
| Login UI (phone → code → display name) | `app/index.tsx` |
| Auth context | `lib/auth-context.tsx` → `verifyWhatsApp()` |

**Behaviour:** On verify, server auto-runs `sync-lekker` against lekker.network → sets `isVerifiedLekkerpreneur`, `lekkerNetworkAccess`, `lekkerWorkspaceId`, `workspaceEmailActive`.

### Phase 2 — Role-based tabs + Browse ✅

| Tab | File | Visibility |
|-----|------|------------|
| Chats | `app/(tabs)/index.tsx` | Everyone |
| Assistant (Cledwyn) | `app/(tabs)/cledwyn.tsx` | Everyone |
| Directory | `app/(tabs)/directory.tsx` | Everyone |
| Newsfeed | `app/(tabs)/feed.tsx` | Everyone (unhidden) |
| Browse | `app/(tabs)/browse.tsx` | Everyone |
| Software | `app/(tabs)/software.tsx` | `isVerifiedLekkerpreneur` |
| Mail | `app/(tabs)/mail.tsx` | Lekkerpreneur + `workspaceEmailActive` |

- Tab gating: `app/(tabs)/_layout.tsx`
- Legacy `network.tsx` hidden (`href: null`)
- Browse shortcuts: `constants/ecosystem.ts`
  - `https://lekkermarketplace.com/shop`
  - `https://lekker.social`
  - Omnibox → Google search or any URL via `app/in-app-browser.tsx`

### Phase 3 — lekker.network integration (client side) ✅

| Feature | Client | Server proxy |
|---------|--------|--------------|
| Software SSO | `lib/lekker-session.ts` | `GET /api/lekker/session-token` |
| Mail status/threads | `lib/mail-api.ts` | `GET /api/lekker/email/*` |
| Directory | `directory.tsx` | `GET /api/directory` → V3 lekkerpreneurs API |

### Phase 4 — Native mail inbox ✅

- `mail.tsx`: thread list + thread detail (pull-to-refresh)
- Compose/reply via `POST /api/lekker/email/send` → V3 mobile email send (P2)

### Phase 5 — Documentation ✅

- Knowledge hub: `user knowledge/infra/LEKKER-CHAT.md`, `KNOWLEDGE_HUB.md` (iCloud, 2026-07-05)
- This handover doc

---

## P3 — Push notifications + Connect API ✅

### Push notifications

| Item | Location |
|------|----------|
| Schema | `push_tokens` in `shared/schema.ts` |
| Register / unregister | `POST` / `DELETE` `/api/push/register` |
| Server send on new message | `server/push.ts` → Expo Push API |
| Client token + registration | `lib/notifications.ts`, `lib/push-api.ts` |
| Auto-register after login | `lib/auth-context.tsx` (when `notificationsEnabled`) |
| Settings toggle | `app/settings.tsx` |

**Note:** Expo push tokens require a real EAS `projectId` in `app.json` (`eas init`). Until then, registration is skipped with a console warning.

### Apple Review test login (no WhatsApp)

Set on Replit: `APPLE_REVIEW_PHONE`, `APPLE_REVIEW_CODE`, optional `APPLE_REVIEW_DISPLAY_NAME`.

| Item | Location |
|------|----------|
| Bypass logic | `server/apple-review-auth.ts` |
| Routes | `POST /api/auth/whatsapp/send-code` + `verify` |
| Pre-seed script | `scripts/seed-apple-reviewer.ts` |

Default credentials (override via env): phone `+27821099999`, code `847291`.

### Connect API (lekker.network Standard Connector)

| Route | Proxies to |
|-------|------------|
| `GET /api/connect/feed` | `getFeed()` |
| `POST /api/connect/contacts` | `submitContactToLekker()` |
| `GET /api/connect/products/search` | `searchProducts()` |
| `POST /api/connect/orders` | `submitOrder()` |
| `POST /api/connect/checkout` | `createCheckout()` |
| `POST /api/connect/shipping/quote` | `getShippingQuote()` |
| `GET /api/connect/gift-cards/validate` | `validateGiftCard()` |
| `POST /api/connect/portal/*` | Portal OTP + `GET /api/connect/portal/me` |

Client helpers: `lib/connect-api.ts`. Requires Replit secrets `LEKKER_WORKSPACE_ID` + `LEKKER_TOKEN`.

---

## Prior work still in effect (build 3 — `95624b8`)

- UGC safety: server blocks + reports (`lib/safety-api.ts`, Settings → Safety)
- App Store compliance doc: `APP_STORE_COMPLIANCE.md`
- Privacy/terms on registration replaced by WhatsApp legal line on login screen

---

## Architecture (post-synergy)

```
Lekker Chat App (Expo)
  ├── WhatsApp OTP → Express API (Replit)
  │     ├── PostgreSQL (Neon Lekker_Chat target)
  │     └── lekker.network Mobile API (X-API-Key)
  │           ├── /api/v1/lekkerpreneurs (directory)
  │           ├── /api/v1/mobile/session-token (Software SSO)
  │           └── /api/v1/mobile/email/* (Mail proxy)
  ├── Browse → WebView (Marketplace shop, Social,任意 URL)
  └── Software → WebView SSO → lekker.network/app
```

**Branding:** User-facing AI is **Cledwyn** only. Grok is internal (OpenRouter model id).

---

## Git & deployment status (Replit-confirmed 2026-07-06)

| Item | Status |
|------|--------|
| All 5 synergy phases built | ✅ Replit verified |
| Production API URL in `eas.json` | ✅ `https://lekkerchat.replit.app` (`979ef25`) |
| Metro stale-temp crash | ✅ Fixed on Replit |
| Code on GitHub `main` | ✅ through `979ef25` |
| `db:push` on production DB | ✅ Runs in Replit deploy chain (`.replit` build) |
| EAS iOS build 4 | ⏳ **Operator:** `eas login` + `eas build` locally |
| `app.json` EAS `projectId` | ⏳ Placeholder `"lekker-chat"` — run `eas init` for real UUID |
| App Store resubmit | ⏳ After EAS build + TestFlight smoke test |

---

## iOS build 4 — steps to run (operator)

EAS CLI is **not logged in** on this machine. Run these locally:

```bash
cd ~/Projects/LEKKER-APP-CHAT
npm install -g eas-cli   # or use npx eas-cli
eas login

# Production URL is already in eas.json — optional EAS secret override:
# eas secret:create --name EXPO_PUBLIC_API_URL \
#   --value "https://lekkerchat.replit.app" --scope project

# Required once: replace placeholder projectId in app.json
eas init   # writes real UUID to app.json extra.eas.projectId — commit the result

# Build
eas build --platform ios --profile production

# Submit after TestFlight validation
eas submit --platform ios
```

**Before build — Replit secrets must include:**

- `DATABASE_URL` (Neon Lekker_Chat pooled URL)
- `SESSION_SECRET`
- `LEKKER_NETWORK_API_KEY` (matches V3 `MOBILE_API_KEY`)
- `TWILIO_WHATSAPP_FROM`, `TWILIO_CONTENT_SID`, Twilio creds (WhatsApp OTP)
- OpenRouter / object storage vars per `replit.md`
- `LEKKER_WORKSPACE_ID` + `LEKKER_TOKEN` (Connect API — optional for Browse/marketplace)

**Smoke test after deploy:**

1. WhatsApp OTP login (new + returning user)
2. Directory loads verified lekkerpreneurs
3. Browse → Marketplace shop + Social open in WebView
4. Lekkerpreneur: Software tab loads lekker.network dashboard (SSO)
5. Lekkerpreneur + mail: Mail tab shows inbox threads
6. Start chat from directory
7. Report/block still works (build 3 compliance)
8. Push: enable notifications in Settings → send test message from another account
9. Connect API (if env set): `GET /api/connect/feed` returns workspace feed

---

## App Store Connect notes (build 4)

Update review notes from build 3:

- **Auth changed:** WhatsApp OTP — no password. Provide a test phone number that receives OTP, or a pre-verified test account.
- **Newsfeed:** Tab is visible again (local AsyncStorage feed — not server-backed; acceptable for 2.1.0 if feed shows content).
- **New tabs:** Directory, Browse, Software (business users), Mail (business email users).
- **Privacy:** https://lekker.network/privacy
- **Terms:** https://lekker.network/terms

See `APP_STORE_COMPLIANCE.md` for UGC/safety copy (still valid).

---

## Schema changes (require `db:push`)

```sql
-- users table
password_hash           -- nullable (phone-only users)
workspace_email_active  -- boolean, default false

-- P2 feed
feed_posts, feed_likes, feed_comments, feed_shares

-- P3 push
push_tokens (user_id, expo_push_token, platform)
```

Run: `npm run db:push` with production `DATABASE_URL`.

---

## Key files reference

| Purpose | Path |
|---------|------|
| Tab layout + role gating | `app/(tabs)/_layout.tsx` |
| WhatsApp login | `app/index.tsx` |
| API routes | `server/routes.ts` |
| Lekker.network client | `server/lekkerNetwork.ts` |
| Ecosystem URLs | `constants/ecosystem.ts` |
| EAS config | `eas.json` |
| iOS checklist | `IOS-PRODUCTION-READINESS.md` |
| Compliance | `APP_STORE_COMPLIANCE.md` |

---

## Known gaps / follow-ups

| Gap | Priority | What it needs |
|-----|----------|---------------|
| EAS iOS build 4 | **P0** | You: `eas login` → `eas init` → `eas build --platform ios --profile production` |
| `app.json` `projectId` | **P0** | Real Expo project UUID from `eas init` (currently `"lekker-chat"` placeholder) |
| Mail compose/reply | ✅ P2 done | Compose + reply in `mail.tsx`; V3 `POST /api/v1/mobile/email/send` |
| Server-backed Newsfeed | ✅ P2 done | `feed_posts` tables + `/api/feed/*`; client uses `lib/feed-api.ts` |
| Push notifications | ✅ P3 done | `push_tokens` + `/api/push/register`; Expo send on new chat messages |
| Connect API wiring | ✅ P3 done | `/api/connect/*` proxies `server/lekker-connect.ts`; client `lib/connect-api.ts` |
| iCloud `LEKKER-APP-CHAT` mirror | P1 | Stash local changes, `git pull` from `main` |

---

## Related handover

Lekker Network (V3) changes that power this app: see `LekkerNetworkV3/HANDOVER.md` @ commit `1505853e`.

---

## Contact / escalation

- Abuse reports: `info@digitalstudiohub.com`
- Apple review issues: update `APP_STORE_COMPLIANCE.md` + resubmit with review notes