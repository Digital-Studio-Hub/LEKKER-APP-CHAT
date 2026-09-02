# Lekker Chat — iOS Production Readiness

Last updated: 2026-07-04

Use **`~/Projects/LEKKER-APP-CHAT`** for all iOS builds (not the iCloud git drive path).

---

## Status summary

| Area | Ready? | Notes |
|------|--------|-------|
| Core auth (register/login/reset) | Yes | JWT + Twilio/Gmail |
| Server-backed P2P + group chat | Yes | PostgreSQL |
| Attachments + profile photos | Yes | Object storage |
| Directory + Lekker sync | Yes | lekker.network API |
| CledwynAI tab | Yes | Streaming Grok |
| Directory → Start chat | **Fixed** | Uses `/api/chats/start-with-contact` |
| Profile → Message | **Fixed** | Server P2P chat |
| Poll voting | **Fixed** | Server persistence |
| Feed (Newsfeed tab) | Hidden | Tab hidden for App Store 2.1.0 — local-only feed not production-ready |
| UGC safety (block/report) | **Fixed** | Server blocks + reports; chat + profile + Settings |
| Privacy disclosure | **Fixed** | Registration checkbox + Settings Data & privacy section |
| App Store compliance doc | **Added** | `APP_STORE_COMPLIANCE.md` — rejection mapping + review notes |
| Push notifications | No | Local only — App Store OK without remote push |
| Neon DB | Pending | Set `DATABASE_URL` to Neon `Lekker_Chat` pooled URL on Replit + verify `db:push` |
| Production API URL in EAS | **Action required** | See step 1 below |
| App Store Connect listing | Action required | Screenshots, description, review notes |
| Apple Developer + EAS credentials | Action required | Certificates via `eas credentials` |

---

## Before you build (required)

### 1. Set production API URL

Replit production serves the API on **port 80** (not `:5000`). In `eas.json` production profile, set:

```json
"env": {
  "EXPO_PUBLIC_API_URL": "https://YOUR-REPLIT-SLUG.replit.app"
}
```

Or set `EXPO_PUBLIC_API_URL` as an **EAS secret** (preferred — no URL in git):

```bash
eas secret:create --name EXPO_PUBLIC_API_URL --value "https://YOUR-REPLIT-SLUG.replit.app" --scope project
```

### 2. Replit backend secrets

Confirm on Replit (Chat deployment):

- `DATABASE_URL` — Neon **Lekker_Chat** pooled connection string
- `SESSION_SECRET` — strong random string
- `LEKKER_NETWORK_API_KEY`
- Twilio + Gmail integration for OTP/reset
- Object storage bucket vars

Run deploy build (`expo:static:build` + `server:build` + `db:push`) and smoke-test:

- Register / login
- Create chat, send message, attachment
- Directory load
- Cledwyn message

### 3. EAS project link

```bash
cd ~/Projects/LEKKER-APP-CHAT
npm install -g eas-cli
eas login
eas init   # if projectId in app.json is still placeholder
```

Commit updated `app.json` `extra.eas.projectId` after `eas init`.

### 4. Apple Developer

- Active Apple Developer Program membership
- App ID `com.lekker.chat` registered
- App Store Connect app record created

```bash
eas credentials --platform ios
```

---

## Build & submit

```bash
cd ~/Projects/LEKKER-APP-CHAT

# Production IPA
eas build --platform ios --profile production

# Submit to App Store Connect
eas submit --platform ios --profile production
```

Increment `ios.buildNumber` in `app.json` for each App Store upload (or rely on `autoIncrement` in `eas.json`).

---

## App Store Connect checklist

- [ ] App name: **Lekker Chat** (or align with Play listing “Lekker” — pick one brand)
- [ ] Subtitle + description (business messaging for SA entrepreneurs)
- [ ] Keywords
- [ ] Privacy policy URL: https://lekker.network/privacy
- [ ] Support URL / email: info@digitalstudiohub.com
- [ ] Screenshots: iPhone 6.7" + 6.5" (Chats, Network, Cledwyn, Settings)
- [ ] Age rating questionnaire (messaging app — likely 12+)
- [ ] Export compliance: `ITSAppUsesNonExemptEncryption: false` already in `app.json`
- [ ] Review notes: use template in `APP_STORE_COMPLIANCE.md` (UGC moderation + test account + no Apple affiliation)
- [ ] Privacy Nutrition Labels aligned with Settings → Data & privacy (see `APP_STORE_COMPLIANCE.md`)
- [ ] iOS buildNumber **3** (App Store compliance resubmission)

---

## Post-launch backlog (not blocking v1)

1. **Neon migration** — move off Replit Postgres to DSH Neon `Lekker_Chat`
2. **Expo push notifications** — register tokens, notify on new server messages
3. ~~**Server-side block list**~~ — done (build 3)
4. **Feed on server** — Newsfeed tab hidden until server feed ships
5. **Wire Connect API** (`lekker-connect.ts`) for forms/CRM from mobile
6. **WebSockets or shorter poll interval** for chat latency
7. **Remove legacy** `lib/storage.ts` conversation code when fully migrated

---

## Local simulator test

```bash
cd ~/Projects/LEKKER-APP-CHAT
cp .env.example .env   # fill DATABASE_URL + SESSION_SECRET
npm run server:dev     # terminal 1
npx expo run:ios -d "iPhone 17 Pro"   # terminal 2
```

For simulator against production API only (no local server):

```
EXPO_PUBLIC_API_URL=https://YOUR-REPLIT-SLUG.replit.app
```