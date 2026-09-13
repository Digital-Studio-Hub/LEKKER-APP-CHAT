# iOS bundle identifier

**Current Expo SoT (`app.json`):** `com.lekker.chat` (matches Android `package`).

| Context | ID |
|---------|-----|
| Previous / legacy ASC listing | `app.replit.lekkerchatios` (ASC app `6761997512`) |
| Apple Developer bundle ID | `com.lekker.chat` (exists — resource `T5UXQSQ2BY`) |
| Target listing | **New** ASC app for `com.lekker.chat` (create in browser; API key cannot CREATE apps) |

**2026-09-13 decision:** Ship Android + iOS as `com.lekker.chat`. Do **not** keep submitting to the Replit-id listing. Create a new App Store Connect app for `com.lekker.chat`, then set `eas.json` → `submit.production.ios.ascAppId` to that numeric ID.

**Notes**

- Prefer building from `~/Projects/LEKKER-APP-CHAT` (no spaces in path).
- Legacy listing (`app.replit.lekkerchatios`) can stay listed until the new app is live, then sunset.
