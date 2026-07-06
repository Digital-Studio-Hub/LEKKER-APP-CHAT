# Lekker Chat — App Store Compliance (Resubmission)

Last updated: 2026-07-06 · iOS build **5** (compliance pass + synergy)

Maps Apple rejection letter (Submission `e6de2131`, reviewed 2026-05-29, v1.0 build 1) to fixes in this build.

---

## Rejection summary → fixes

| Guideline | Issue | Fix in build 5 |
|-----------|-------|----------------|
| **5.1.2** Privacy — Contacts uploaded without consent | Contact cards uploaded to server; unclear disclosure | Updated `NSContactsUsageDescription`; in-app consent before address-book read (`lib/contacts-consent.ts`); pre-upload confirmation before sharing a contact card; Settings → Data & privacy contacts disclosure |
| **5.1.1(v)** Account deletion | No in-app account deletion | Settings → **Delete Account** (two-step confirm) → `DELETE /api/auth/account` (permanent; includes feed, push tokens, emails) |
| **1.2** Safety — UGC | Missing EULA, filtering, flagging, blocking | Explicit Terms + Privacy + **Community Guidelines** checkbox on login (no tolerance language); report/block in chat + profiles + Settings; `shared/content-filter.ts` blocks objectionable language client + server; 24h review at `info@digitalstudiohub.com` |
| **2.1(a)** App Completeness | Name field showed number keyboard | WhatsApp login: separate **Display name** step with `keyboardType="default"` + `textContentType="name"` |
| **5.2.5** Apple trademarks | “iOS” in display name | App on-device name is **Lekker Chat** only — verify App Store Connect metadata has no “iOS” / Apple-like terms |

---

## Review notes (paste into App Store Connect)

```
CONTACTS (5.1.2):
- The full address book is NEVER uploaded to our servers.
- Contacts are read on-device only to help users find friends (New Chat).
- If a user shares a contact card in a chat, they see an in-app consent dialog first;
  only then is that contact's name and phone uploaded and sent to conversation participants.
- NSContactsUsageDescription and Settings → Data & privacy explain this.

ACCOUNT DELETION (5.1.1v):
- Settings → scroll to bottom → Delete Account → two-step confirmation → permanent deletion.

UGC SAFETY (1.2):
- Login requires checkbox acceptance of Terms, Privacy Policy, and Community Guidelines.
- Users can report messages (long-press) and users (flag icon in chat or profile).
- Users can block others; blocked users cannot message them.
- Automated content filter blocks profanity/slurs on send (messages, feed posts, comments).
- Reports reviewed within 24 hours at info@digitalstudiohub.com.

LOGIN / NAME KEYBOARD (2.1a):
- WhatsApp OTP flow: phone → 6-digit code → display name (full text keyboard on separate screen).

Apple Review test account (no WhatsApp — set Replit secrets, then deploy):

| Secret | Example value |
|--------|----------------|
| `APPLE_REVIEW_PHONE` | `+27821099999` |
| `APPLE_REVIEW_CODE` | `847291` |
| `APPLE_REVIEW_DISPLAY_NAME` | `Apple Reviewer` (optional) |

**Sign-in steps for reviewers:**
1. Enter phone `082 109 9999` (or `+27821099999`)
2. Tap **Send WhatsApp Code** (no message is sent)
3. Enter code `847291`
4. Accept Terms checkbox → **Sign In**

Optional pre-seed: `npx tsx --env-file=.env scripts/seed-apple-reviewer.ts`

Screen recordings attached: login + name entry, report/block, account deletion.

Lekker Chat is an independent app by Digital Studio Hub / Lekker Network.
It is not affiliated with, endorsed by, or sponsored by Apple Inc.
```

---

## In-app safety (Guideline 1.2)

- **Terms acceptance:** Login checkbox — Terms, Privacy, Community Guidelines + no-tolerance statement
- **Content filter:** `shared/content-filter.ts` — client alerts + server `400 CONTENT_BLOCKED`
- **Report content:** Long-press message → Report; chat header flag → Report user
- **Block user:** Chat header ban icon; profile ban icon; Settings → Blocked Users
- **Community guidelines:** Settings → Safety → `https://lekker.network/terms`
- **Abuse email:** `info@digitalstudiohub.com`
- **Server:** `POST /api/safety/report`, `POST/DELETE /api/safety/block`

---

## Contacts (Guideline 5.1.2)

| Action | Server upload? | User consent |
|--------|----------------|--------------|
| New Chat — find friends | No (local match) | In-app dialog + iOS permission |
| Share contact card in chat | Yes (message field) | Pre-share confirmation dialog |
| Search users by phone | Single number lookup only | N/A |

---

## App Privacy (Nutrition Labels)

Align App Store Connect with Settings → Data & privacy. **Contacts:** optional, used for on-device friend finding; shared contact cards stored as message content only when user explicitly shares.

**Privacy Policy URL:** https://lekker.network/privacy

---

## Before you resubmit

1. **Replit:** Deploy latest `main`; `db:push` for all tables
2. **EAS:** `eas build --platform ios --profile production` (buildNumber **5**)
3. **App Store Connect:** Remove “iOS” from app name/subtitle/keywords if present
4. **Recordings:** Login → name → report → block → delete account (physical device)
5. **Submit:** `eas submit --platform ios`