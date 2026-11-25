# Lekker Chat — Huawei AppGallery

Android listing build for AppGallery. Package name stays `com.lekker.chat`. This file has no secrets and no review phone numbers or codes.

Do not upload a Play-distributed APK. Play App Signing re-signs that file. Build with the profile below so the artifact is signed with the existing EAS upload key.

## Build

```bash
eas build --platform android --profile appgallery
```

The `appgallery` profile in `eas.json`:

- Android **APK** (`buildType: apk`). AppGallery accepts an APK. An AAB needs AppGallery App Signing and stays under Huawei’s 150 MB bundle limit; switch `buildType` to `app-bundle` only after that is set up.
- Production API: `EXPO_PUBLIC_API_URL=https://chat.lekker.network`.
- `autoIncrement: false`. `cli.appVersionSource` is `local`, so the version comes from `app.json` (`1.2.9` / `android.versionCode` 62 on this branch). Play’s `production` profile still auto-increments. Do not let the two profiles race. Bump `android.versionCode` in `app.json` on purpose before an AppGallery build, and keep that number in one sequence with Play. A phone that already has a higher versionCode from Play will not install a lower AppGallery build of the same package.
- **No** `submit` block. `eas submit` is not wired to AppGallery. Do not submit this profile to Google Play.

There is no separate package name in this profile.

## Signing

`android.credentialsSource` is `remote`. That is the Expo-stored upload keystore, the same default keystore the Play `production` profile uses. No keystore, password, or new credential is in this repo.

Do not generate a new Android keystore for `appgallery`. If a build prompt offers to create one, cancel and assign the existing Play upload keystore instead. A second key means Play and AppGallery installs of `com.lekker.chat` cannot update each other.

`keystoreName` is intentionally unset. A wrong name can create a new keystore on EAS. Production does not set one either, so both profiles use the project default.

## Push

On Android the client checks Google Play services:

- **Available:** Expo push token, stored as provider `fcm`. The server sends it through the Expo push service (FCM), same as Play builds.
- **Unavailable:** Huawei Push Kit token (`HmsInstanceId.getToken`, scope `HCM`), stored as provider `hms`. The server sends it through Push Kit.
- **Unknown** (native module missing): try FCM, then HMS. Neither failure crashes the app.
- **iOS:** unchanged Expo token, stored as `apns`, still sent via Expo.

`POST /api/push/register` accepts optional `provider` (`fcm`, `hms`, `apns`, `expo`). Omitted or unknown values are stored as `expo` so older clients keep working. `hms` is the only provider that uses Huawei. Everything else uses Expo.

Column: `push_tokens.provider`. Migration: `migrations/20261125_push_token_provider.sql`. Apply it on the target Neon database before deploying the server that writes the column. Deploy does not migrate. See `docs/SCHEMA_APPLY.md`.

### Server environment

Set these on the Chat server (Cloud Run `lekker-chat` or the current host). Do not commit values.

| Name | What it is |
|------|------------|
| `HUAWEI_PUSH_APP_ID` | Push Kit OAuth client id / app id from AppGallery Connect project **LekkerChat** (Project settings → General information, or the Android app’s App ID). Not a team-level Connect API client (Project = N/A). |
| `HUAWEI_PUSH_APP_SECRET` | The matching app secret. If that secret is already stored as `HUAWEI_AGC_CLIENT_SECRET`, copy it into this name after confirming it is the Push Kit app secret. Do not send this pair to the Connect publishing token URL. |

If either variable is missing, the API keeps running. HMS tokens stay in `push_tokens` and are not delivered. FCM and APNs sends are unchanged. A warning is logged once per process.

The send path is Push Kit for Android HMS devices: OAuth `https://oauth-login.cloud.huawei.com/oauth2/v3/token` (`grant_type=client_credentials`), then `POST https://push-api.cloud.huawei.com/v1/{appId}/messages:send`. It is not HarmonyOS Push Kit v3 (service-account JWT).

### Client app id

`EXPO_PUBLIC_HUAWEI_APP_ID` is the same public app id, set as an EAS environment variable for the `appgallery` profile when the Android app exists in AppGallery Connect. It is not in `eas.json`, so an empty value cannot override a secret. The config plugin writes `com.huawei.hms.client.appid` only when the variable is present at prebuild.

Without that variable and without `agconnect-services.json`, the HMS token call returns null and the rest of the app still runs. GMS devices still register FCM. Passing the app id into `HmsInstanceId.getToken(appId, "HCM")` does not need the AGConnect Gradle plugin.

`agconnect-services.json` is gitignored (it contains the app secret). If that file is present at prebuild, the config plugin copies it into `android/app/`, adds the `com.huawei.agconnect:agcp` classpath, and applies `com.huawei.agconnect`. Copying the file alone does not configure HMS. Builds without the file do not apply the plugin, so a Play build is not required to have it. Do not commit the file.

Huawei can return a token later, or replace one, through `HmsMessageService.onNewToken`. That token is stored on the device and registered with provider `hms` when Google Play services are not available. A GMS device does not replace its FCM registration with that token.

The native module lives in `modules/lekker-hms-push` and is autolinked from `modules/` (Expo’s default). The plugin `./modules/lekker-hms-push/app.plugin.js` adds Huawei’s Maven repo (`https://developer.huawei.com/repo/`).

A Push Kit HTTP 200 is delivered only when the JSON body has `code` `80000000`. Other codes, including partial success `80100000`, are logged and not reported as delivered. The log line is the code, not the token.

## Location links

Shared locations no longer open `https://www.google.com/maps`. Android uses a `geo:` URI, iOS uses the Apple Maps `maps:` scheme, and web uses OpenStreetMap.

## Review test account

Huawei reviewers can use the existing App Store review test account. The in-app name is **Apple Reviewer** unless the server’s `APPLE_REVIEW_DISPLAY_NAME` is set to something else.

The bypass is in `server/apple-review-auth.ts`. It is not limited to iOS, an Apple user agent, or App Store traffic. When `APPLE_REVIEW_PHONE` and `APPLE_REVIEW_CODE` are set, that phone skips the WhatsApp send and the OTP rate limiter, and `POST /api/auth/whatsapp/verify` accepts the static code. The code is not a one-time database OTP, so reviewers can sign in more than once. The first success creates the user if needed; later successes sign in to the same user. The screen is the normal WhatsApp OTP login.

Nothing else is required in this repo. Before submit, confirm those two variables are still set on the production Chat server. If they were removed after App Store review, put the same pair back. Do not add a second bypass, and do not put the phone number or code in git or in this file. Delano pastes them into the AppGallery review notes.

## Not in this change

No AppGallery upload, no `eas submit`, no production deploy, no new keystore, and no Account Kit, IAP, or HMS Maps SDK.
