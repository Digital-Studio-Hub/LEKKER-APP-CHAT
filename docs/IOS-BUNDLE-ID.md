# iOS bundle identifier

**Current Expo SoT (`app.json`):** `com.lekker.chat` (matches Android `package`).

| Context | ID |
|---------|-----|
| Previous `app.json` | `app.replit.lekkerchatios` |
| Local Xcode (`ios/…/project.pbxproj`) | Often already `com.lekker.chat` |
| Target | `com.lekker.chat` |

**Notes**

- Next `expo prebuild` will keep iOS aligned with `app.json`.
- If the live App Store app was shipped under `app.replit.lekkerchatios`, App Store Connect migration (or a new listing) may be required before submitting as `com.lekker.chat`.
- Prefer building from `~/Projects/LEKKER-APP-CHAT` (no spaces in path).
