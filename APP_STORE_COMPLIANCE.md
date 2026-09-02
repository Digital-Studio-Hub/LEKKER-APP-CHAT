# Lekker Chat — App Store Compliance (Resubmission)

Last updated: 2026-07-04 · iOS build **3**

This document maps Apple rejection reasons to fixes in this build and what to configure in App Store Connect before resubmitting.

---

## Rejection summary → fixes

| Guideline | Issue | Fix in build 3 |
|-----------|-------|----------------|
| **1.2.0** Safety — User Generated Content | Missing moderation tools | Server-backed block list + content reports; flag user/message in chat; report/block on user profiles; Safety section in Settings; abuse contact `info@digitalstudiohub.com`; 24h review copy |
| **2.1.0** Performance — App Completeness | Incomplete / broken features | Newsfeed tab hidden (`href: null`) until server-backed feed ships |
| **5.1.1** Privacy — Data Collection & Storage | Labels / disclosure mismatch | In-app **Data & privacy** disclosure in Settings; registration requires explicit Terms + Privacy + Community Guidelines checkbox |
| **5.1.2** Privacy — Data Use and Sharing | Unclear data sharing | Settings disclosure states no sale of data; limited sharing with SMS/email, hosting, AI providers only to operate the app; no cross-app tracking |
| **5.2.5** Legal — Apple Products | Improper Apple trademarks | Removed Apple logo from dev landing page; app UI uses only Lekker branding (no Apple logos or “Made for iPhone” marks) |

---

## In-app safety (Guideline 1.2)

- **Report content:** Long-press any message → Report; chat header flag icon → Report user
- **Block user:** Chat header ban icon; user profile ban icon; manage list in Settings → Blocked Users
- **Community guidelines:** Settings → Safety → Community guidelines (`https://lekker.network/terms`)
- **Abuse email:** `info@digitalstudiohub.com` (also in report confirmation alert)
- **Server:** `POST /api/safety/report`, `POST/DELETE /api/safety/block`, block enforcement on chat create + message send

### Review notes (paste into App Store Connect)

```
UGC moderation:
- Users can report messages (long-press) and users (flag icon in chat or on profile).
- Users can block others; blocked users cannot message them.
- Reports are stored server-side and reviewed within 24 hours at info@digitalstudiohub.com.
- Community guidelines: https://lekker.network/terms

Test account:
[Provide email + password for a reviewer account]

Lekker Chat is an independent app by Digital Studio Hub / Lekker Network.
It is not affiliated with, endorsed by, or sponsored by Apple Inc.
```

---

## App Privacy (Nutrition Labels) — align with 5.1.1 / 5.1.2

Configure in App Store Connect → App Privacy to match in-app disclosure (Settings → Data & privacy):

| Data type | Collected | Linked to user | Used for | Shared with third parties |
|-----------|-----------|----------------|----------|---------------------------|
| Name | Yes | Yes | App functionality, account | No (except processors below) |
| Email address | Yes | Yes | App functionality, account | No |
| Phone number | Yes | Yes | App functionality, account, fraud prevention | No |
| User ID | Yes | Yes | App functionality | No |
| Photos / videos | Yes (optional) | Yes | App functionality (chat attachments) | No |
| Audio data | Yes (optional) | Yes | App functionality (voice notes) | No |
| Precise location | Yes (optional) | Yes | App functionality (nearby directory) | No |
| Contacts | Yes (optional) | Yes | App functionality (share contact cards) | No |
| Other user content | Yes | Yes | App functionality (messages, profile bio) | No |
| Crash data | If using default Expo analytics | Per your EAS settings | Analytics | Per EAS |

**Third-party processors (not “sold”):** cloud hosting (Replit/Neon), Twilio (SMS), email delivery, object storage, AI API (Cledwyn assistant).

**Tracking:** Set to **No** — app does not use App Tracking Transparency or cross-app tracking.

**Privacy Policy URL:** https://lekker.network/privacy

---

## Permissions (Info.plist)

Removed unused declarations that triggered review questions:

- `NSFaceIDUsageDescription` — Face ID not implemented
- `NSCalendarsUsageDescription` — calendar not used
- `NSUserTrackingUsageDescription` — no tracking

Retained only permissions the app actually requests: camera, photo library, microphone, location, contacts.

---

## Before you resubmit

1. **Replit:** Run `npm run db:push` (or deploy pipeline) so `user_blocks` and `content_reports` tables exist
2. **EAS secret:** `EXPO_PUBLIC_API_URL=https://YOUR-SLUG.replit.app`
3. **Build:** `eas build --platform ios --profile production`
4. **Submit:** `eas submit --platform ios --profile production`
5. **App Store Connect:** Update Privacy labels (above), paste review notes, attach build 3
6. **Increment:** `ios.buildNumber` in `app.json` for each new upload (currently `3`)

---

## Post-approval backlog

- Server-backed Newsfeed (re-enable tab when ready)
- Remote push notifications for new messages
- Migrate production DB fully to Neon `Lekker_Chat` branch