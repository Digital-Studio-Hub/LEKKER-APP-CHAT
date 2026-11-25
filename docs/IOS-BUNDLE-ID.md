# iOS bundle identifier

**Current Expo SoT (`app.json`):** iOS `app.replit.lekkerchatios` (see 2026-11-25 update below); Android `package` `com.lekker.chat`.

| Context | ID |
|---------|-----|
| Previous / legacy ASC listing | `app.replit.lekkerchatios` (ASC app `6761997512`) |
| Apple Developer bundle ID | `com.lekker.chat` (exists — resource `T5UXQSQ2BY`) |
| Target listing | **New** ASC app for `com.lekker.chat` (create in browser; API key cannot CREATE apps) |

**2026-09-13 decision:** Ship Android + iOS as `com.lekker.chat`. Do **not** keep submitting to the Replit-id listing. Create a new App Store Connect app for `com.lekker.chat`, then set `eas.json` → `submit.production.ios.ascAppId` to that numeric ID.

**Notes**

- Prefer building from `~/Projects/LEKKER-APP-CHAT` (no spaces in path).
- Legacy listing (`app.replit.lekkerchatios`) can stay listed until the new app is live, then sunset.

**2026-11-25 update (Delano approved 09:48 SAST, via PA):** iOS ships on the **existing** App Store Connect app `6761997512`, so `app.json` → `ios.bundleIdentifier` is now **`app.replit.lekkerchatios`** (App ID `KCP43KJMLS`, team `HAZ87MAKR8`, App Store profile `79393YFA2V`, dist cert `27FB9F2FHD`). Android stays **`com.lekker.chat`**. `eas.json` `ascAppId` `6761997512` already matches. This supersedes the 13 Sep plan to create a new ASC app for `com.lekker.chat`; the `com.lekker.chat` App ID (`T5UXQSQ2BY`) is left in place but unused for iOS.
