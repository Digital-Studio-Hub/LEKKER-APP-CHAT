# Lekker Chat — App Store Deployment Guide

This guide covers both **Google Play (Android)** and **Apple App Store (iOS)** submission.

---

## Prerequisites
- Google Play Developer account ($25 one-time fee at play.google.com/console)
- Apple Developer account ($99/year at developer.apple.com)
- Node.js 18+ installed on your local machine
- Expo account (expo.dev) — free
- EAS CLI installed globally

---

## Step 1: Install EAS CLI (Local Machine)

```bash
npm install -g eas-cli
eas login
```

---

## Step 2: Download the Project from Replit

Download the project from Replit to your local machine (use the three-dot menu → Download as ZIP, or connect via Git).

---

## Step 3: Set Your Production Backend URL

Before building, update `eas.json` — replace `your-production-domain.replit.app` with your actual Replit deployment URL:

```json
"env": {
  "EXPO_PUBLIC_DOMAIN": "your-actual-domain.replit.app:5000"
}
```

---

## Step 4: Link EAS to Your Expo Project

Inside the project directory on your local machine:

```bash
eas init
```

This creates a project on expo.dev and updates `app.json` with the real `projectId`. Commit the updated `app.json`.

---

# Android (Google Play)

## Step A1: Build the Android App Bundle

```bash
eas build --platform android --profile production
```

- Builds a `.aab` (Android App Bundle) on Expo's cloud servers — no Android SDK needed locally
- Takes ~10–20 minutes
- Download the `.aab` when complete

## Step A2: Create Your App on Google Play Console

1. Go to [play.google.com/console](https://play.google.com/console)
2. Click **Create app**
3. Fill in: App name `Lekker Chat`, language `English`, type `App`, free
4. Accept declarations → **Create app**

## Step A3: Complete the Store Listing

Go to **Store presence → Main store listing**:

- **Short description** (80 chars): `Business messaging for Lekkerpreneurs — connect, chat, and grow.`
- **Full description**: See below
- **Privacy Policy URL**: `https://lekker.network/privacy`

```
Lekker Chat is the official messaging app for the Lekker Network — connecting South African Lekkerpreneurs with their clients and business community.

Features:
• Secure P2P and group messaging
• CledwynAI — your AI business assistant powered by Grok
• Lekkerpreneur Directory — find verified local businesses
• Social feed — share updates with your network
• Voice notes, image sharing, file attachments
• Auto-reply for when you're busy
• Password-protected with 2-step verification reset
• Push notifications for new messages
• Location-based Lekkerpreneur discovery

Built for South African entrepreneurs on the Lekker Network platform.
```

### Graphics Required
| Asset | Size | Notes |
|---|---|---|
| App icon | 512×512 PNG | No rounded corners (Google adds them) |
| Feature graphic | 1024×500 PNG | Shown at top of listing |
| Phone screenshots | Min 2, min 1080px | Take from the app |

## Step A4: Complete Content Declarations

### Content Rating
- Go to **Policy → App content → Content rating**
- Answer the questionnaire (Communication app, no violence, no adult content)

### Data Safety
- Go to **Policy → App content → Data safety**

| Data Type | Collected | Shared | Required |
|---|---|---|---|
| Name | Yes | No | Yes |
| Email address | Yes | No | Yes |
| Phone number | Yes | No | Yes |
| User IDs | Yes | No | Yes |
| Messages | Yes | No | Yes |
| Photos/videos | Yes | No | No |
| Audio files | Yes | No | No |
| Precise location | Optional | No | No |
| Contacts | Optional | No | No |

- Data encrypted in transit: **Yes**
- Users can request deletion: **Yes** (via account settings)

### Target Audience
- Target age: **18+** | Contains ads: **No**

## Step A5: Upload AAB and Submit

1. Go to **Release → Production → Create new release**
2. Upload the `.aab` file
3. Add release notes: `Initial release of Lekker Chat`
4. Click **Review release** → **Start rollout to Production**

Google review: typically **1–3 business days** for first submissions.

---

# iOS (Apple App Store)

## Step B1: Build the iOS Archive

```bash
eas build --platform ios --profile production
```

- Builds an `.ipa` on Expo's Mac build servers — no Mac needed locally
- Takes ~15–25 minutes
- You will be prompted to log in to your Apple Developer account

## Step B2: Create Your App on App Store Connect

1. Go to [appstoreconnect.apple.com](https://appstoreconnect.apple.com)
2. Click **+** → **New App**
3. Fill in:
   - Platform: **iOS**
   - Name: **Lekker Chat**
   - Primary Language: **English (South Africa)** or **English**
   - Bundle ID: `com.lekker.chat` (must match `app.json`)
   - SKU: `com.lekker.chat` (any unique string)
4. Click **Create**

## Step B3: Complete the App Information

Under **App Information**:
- **Privacy Policy URL**: `https://lekker.network/privacy`
- **Category**: Social Networking (Primary) / Business (Secondary)
- **Content Rights**: Does not contain third-party content

## Step B4: Complete the Store Listing

Under **App Store → [version] → App Store Information**:

- **Description**: Same as Android description above
- **Keywords**: `lekker,lekkerpreneur,south africa,business chat,networking,entrepreneur`
- **Support URL**: `https://lekker.network`
- **Marketing URL**: `https://lekker.network`
- **Privacy Policy URL**: `https://lekker.network/privacy`

### Screenshots Required (per device size)
| Device | Size |
|---|---|
| iPhone 6.9" (required) | 1320×2868 or 1290×2796 |
| iPhone 6.7" (required) | 1290×2796 |
| iPad 13" (if tablet support enabled) | 2048×2732 |

Take screenshots via Expo Go on a physical device or iOS Simulator.

## Step B5: App Privacy (Data Practices)

Under **App Privacy → Edit**:

Declare the following data types as **Data Linked to You**:
- Contact Info: Name, Email Address, Phone Number
- User Content: Messages, Photos or Videos, Audio Data
- Identifiers: User ID

Declare the following as **Data Not Linked to You** (optional, user-initiated):
- Location (Precise)
- Contacts

**Tracking**: Select **No** — app does not track users across other apps.

## Step B6: Export Compliance

When asked about encryption:
- **Does your app use encryption?** → **Yes**
- **Does it qualify for the standard encryption exemption?** → **Yes** (uses standard HTTPS/TLS only)
- `ITSAppUsesNonExemptEncryption: false` is already set in `app.json` — this satisfies Apple automatically

## Step B7: Upload Build and Submit for Review

1. Go to **TestFlight** tab → your build should appear within ~30 minutes of `eas build` completing
2. Go back to **App Store** tab → **[version] → Build** → select your build
3. Fill in **What's New** (version notes): `Initial release of Lekker Chat`
4. Click **Add for Review** → **Submit to App Review**

Apple review: typically **24–48 hours** for first submissions (can be up to 3 days).

## Step B8: Replit Expo Launch (Alternative for iOS)

If you prefer, Replit's built-in **Expo Launch** handles the iOS App Store submission automatically:
- Click the **Publish** button in Replit
- Replit builds and submits to App Store on your behalf
- You still need an Apple Developer account

---

## Subsequent Updates (Both Platforms)

For future updates:
1. Increment `version` string in `app.json` (e.g. "1.0.1", "1.1.0")
2. Increment `versionCode` (Android) and `buildNumber` (iOS) in `app.json`
3. Run `eas build --platform all --profile production`
4. Upload to respective store consoles

---

## Important Notes

- **Publish backend first**: Your Replit app must be deployed before submitting — reviewers test the live app
- **Twilio**: Upgraded account sends SMS resets to all phone numbers globally
- **Privacy Policy**: `https://lekker.network/privacy` — linked in app (Settings + registration screen)
- **Terms**: `https://lekker.network/terms` — linked in app (Settings + registration screen)
- **Both stores require** the privacy policy URL to be live and accessible at review time
