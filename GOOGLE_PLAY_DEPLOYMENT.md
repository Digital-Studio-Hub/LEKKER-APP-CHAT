# Lekker Chat — Google Play Store Deployment Guide

## Prerequisites
- Google Play Developer account ($25 one-time fee at play.google.com/console)
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

## Step 5: Build the Android App Bundle

```bash
eas build --platform android --profile production
```

- This builds a `.aab` (Android App Bundle) file on Expo's cloud build servers
- No Android SDK or Java installation needed on your machine
- Build takes ~10–20 minutes
- Download the `.aab` file when complete

---

## Step 6: Create Your App on Google Play Console

1. Go to [play.google.com/console](https://play.google.com/console)
2. Click **Create app**
3. Fill in:
   - App name: `Lekker Chat`
   - Default language: `English (South Africa)` or `English`
   - App or game: `App`
   - Free or paid: `Free`
4. Accept the declarations and click **Create app**

---

## Step 7: Complete the Store Listing

Go to **Store presence → Main store listing** and fill in:

### App Details
- **Short description** (80 chars): `Business messaging for Lekkerpreneurs — connect, chat, and grow.`
- **Full description** (4000 chars):
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
| Privacy Policy URL | — | https://lekker.network/privacy |

---

## Step 8: Complete Content Declarations

### Content Rating
- Go to **Policy → App content → Content rating**
- Answer the questionnaire (Communication app, no violence, no adult content)

### Data Safety
- Go to **Policy → App content → Data safety**
- Declare the following data collected:

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

- Data is encrypted in transit: **Yes**
- Users can request deletion: **Yes** (via account settings)

### Target Audience
- Target age: **18+**
- Contains ads: **No**

---

## Step 9: Upload the AAB and Submit

1. Go to **Release → Production**
2. Click **Create new release**
3. Upload the `.aab` file from Step 5
4. Add release notes (e.g. "Initial release of Lekker Chat")
5. Click **Review release** then **Start rollout to Production**

---

## Step 10: Wait for Review

- Google review typically takes **1–3 business days** for first submissions
- You'll receive an email when approved or if changes are needed

---

## Subsequent Updates

For future updates:
1. Increment `versionCode` in `app.json` (e.g. 2, 3, 4...)
2. Increment `version` string (e.g. "1.0.1", "1.1.0")
3. Run `eas build --platform android --profile production` again
4. Upload the new `.aab` to a new release on Google Play Console

---

## Important Notes

- **Production backend**: Make sure your Replit app is published (deployed) before submitting — the backend must be live for the app to work
- **Twilio**: Your upgraded Twilio account will send SMS resets to all phone numbers
- **Privacy Policy**: https://lekker.network/privacy (already linked in app)
- **Terms**: https://lekker.network/terms (already linked in app)
