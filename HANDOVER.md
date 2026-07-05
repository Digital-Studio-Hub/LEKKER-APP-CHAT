# Lekker Chat — Handover Document

**Date:** 2026-07-05  
**Prepared by:** Grok (Digital Studio Hub agent session)  
**Repo:** `Digital-Studio-Hub/LEKKER-APP-CHAT`  
**Canonical build path:** `~/Projects/LEKKER-APP-CHAT`  
**Latest commit:** `e6da2c4` — *feat: ecosystem synergy — WhatsApp OTP, role-based tabs, mail SSO*

---

## Executive summary

Lekker Chat has been upgraded from a password-based messaging app to a **passwordless, ecosystem-connected mobile product**. Users sign in with **WhatsApp OTP** (phone + one-time code). New users add a **display name** only. The app now exposes **role-based tabs** tied to lekker.network identity: everyone gets Directory, Newsfeed, and Browse; verified lekkerpreneurs get Software (full lekker.network dashboard via SSO WebView); lekkerpreneurs with active workspace email get a **native Mail inbox**.

This build is **iOS build 4** (`app.json` → `buildNumber: "4"`). It supersedes build 3 (App Store compliance pass at commit `95624b8`).

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

### Phase 4 — Native mail inbox ✅ (read-only)

- `mail.tsx`: thread list + thread detail (pull-to-refresh)
- **Not built:** compose/reply (`POST /api/v1/mobile/email/send` on V3)

### Phase 5 — Documentation ✅

- Knowledge hub: `user knowledge/infra/LEKKER-CHAT.md`, `KNOWLEDGE_HUB.md` (iCloud, 2026-07-05)
- This handover doc

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

## Git & deployment status

| Item | Status |
|------|--------|
| Code committed | ✅ `e6da2c4` on `main` |
| Pushed to GitHub | ✅ `Digital-Studio-Hub/LEKKER-APP-CHAT` |
| Replit redeploy | ⏳ **You must redeploy** Replit after pulling `main` |
| `db:push` on production DB | ⏳ Run on Replit deploy (in `.replit` build chain) or manually |
| EAS iOS build 4 | ⏳ **Blocked — `eas login` required** (see below) |
| App Store resubmit | ⏳ After EAS build + TestFlight smoke test |

---

## iOS build 4 — steps to run (operator)

EAS CLI is **not logged in** on this machine. Run these locally:

```bash
cd ~/Projects/LEKKER-APP-CHAT
npm install -g eas-cli   # or use npx eas-cli
eas login

# Set production API URL (Replit serves API on port 80, no :5000)
eas secret:create --name EXPO_PUBLIC_API_URL \
  --value "https://YOUR-REPLIT-SLUG.replit.app" \
  --scope project

# Link EAS project if needed (app.json still has placeholder projectId "lekker-chat")
eas init

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

**Smoke test after deploy:**

1. WhatsApp OTP login (new + returning user)
2. Directory loads verified lekkerpreneurs
3. Browse → Marketplace shop + Social open in WebView
4. Lekkerpreneur: Software tab loads lekker.network dashboard (SSO)
5. Lekkerpreneur + mail: Mail tab shows inbox threads
6. Start chat from directory
7. Report/block still works (build 3 compliance)

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
password_hash     -- now nullable (phone-only users)
workspace_email_active  -- boolean, default false
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

| Gap | Priority |
|-----|----------|
| EAS build not triggered (no Expo login) | **P0** — operator action |
| Replit production URL still placeholder in `eas.json` | **P0** |
| Mail send/reply from app | P2 |
| Server-backed Newsfeed | P2 |
| Push notifications | P3 |
| Connect API wiring (`server/lekker-connect.ts`) | P3 |
| iCloud `LEKKER-APP-CHAT` mirror sync from `~/Projects` | P1 |

---

## Related handover

Lekker Network (V3) changes that power this app: see `LekkerNetworkV3/HANDOVER.md` @ commit `1505853e`.

---

## Contact / escalation

- Abuse reports: `info@digitalstudiohub.com`
- Apple review issues: update `APP_STORE_COMPLIANCE.md` + resubmit with review notes