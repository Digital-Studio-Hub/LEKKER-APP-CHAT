# App Store Connect reply — Submission 018ba145-584d-4f51-9f0e-480bb14dc1e1

**App:** Lekker Chat · Version reviewed 1.1 (11) · Review date 7 Sep 2026  
**Paste into Resolution Center** (reply to Apple’s message).

---

## Reply text (copy below)

```
Hello App Review team,

Thank you for the detailed feedback on submission 018ba145-584d-4f51-9f0e-480bb14dc1e1. We have addressed each item.

────────────────────────────────────────
GUIDELINE 2.1(a) — App Completeness (login / “code was used”)
────────────────────────────────────────

Root cause: the production API the reviewed build called could mark a one-time OTP as used, so a second attempt during review failed with “This code has already been used.”

Fix in this resubmission:
• Apple Review uses a static, reusable test login that never consumes a one-time OTP.
• Backend no longer returns “code already used” for the review phone.
• Production API for this build: https://chat.lekker.network (Cloud Run), not lekkerchat.replit.app.

Apple Review demo account (iPhone and iPad):
1. Accept Terms / Privacy / Community Guidelines checkbox
2. Phone: 082 109 9999   (or +27821099999)
3. Tap “Send WhatsApp Code” — no WhatsApp message is sent
4. Code: 847291
5. You are signed in as “Apple Reviewer”

This login works repeatedly on iPhone and iPad. Please retry with a fresh install of this build if needed.

────────────────────────────────────────
GUIDELINE 2.3.6 — Age Rating / In-App Controls
────────────────────────────────────────

We have updated App Information → Age Rating so “Age Assurance” / In-App Controls is set to None, matching the questionnaire.

Separately, social surfaces (Newsfeed and Lekker Social browse) still use an in-app age confirmation (device Declared Age Range on supported iOS, or date-of-birth fallback) to block under-13 access to social UGC. That is not marketed as parental PIN controls.

How to see age confirmation (optional):
1. Sign in with the demo account above
2. Open the Newsfeed tab
3. If age is not yet confirmed, the “Confirm your age” modal appears

────────────────────────────────────────
GUIDELINE 2.1(b) — Business model
────────────────────────────────────────

1. Who uses paid features?
   South African small-business owners (“Lekkerpreneurs”) who already subscribe to The Lekker Network business platform on the web. Consumers use Lekker Chat messaging for free.

2. Where are paid features purchased?
   Only on the web at https://lekker.network (Lekker Plan, currently R799/month). There is no In-App Purchase in Lekker Chat. No digital goods are sold inside the iOS app.

3. What previously purchased features can users access in the app?
   Verified Lekkerpreneurs can open the “Software” tab, which loads their existing lekker.network business dashboard in a WebView (CRM, quotes, etc. already purchased on the website). Mail tab appears only if they already have workspace email on lekker.network.

4. What paid content/subscriptions unlock in-app without IAP?
   None are sold or unlocked via the iOS app. The app does not charge for chat, directory, or assistant. Web-purchased Lekker Network access is account-linked after WhatsApp login sync; it is enterprise/business SaaS purchased outside the app.

5. Are enterprise services sold to single users, consumers, or families?
   Sold to individual micro/small business operators (B2B), not to families or general consumers as a paid consumer subscription.

6. How do users obtain an account? Is there a fee to create an account?
   Free WhatsApp OTP sign-in creates a Lekker Chat account at no cost. No fee to register. Optional Lekker Network business subscription is purchased only on the website for business tools.

We do not offer physical goods, reader content, or multiplayer games that would require IAP for digital unlocks inside this app.

Happy to clarify further. Thank you for your review.

— Digital Studio Hub / Lekker Network
```

---

## Your checklist before resubmit

| # | Action | Where |
|---|--------|--------|
| 1 | Set Age Rating → **Age Assurance / In-App Controls → None** | App Store Connect → App Information → Age Rating |
| 2 | Paste reply above into Resolution Center | App Store Connect → the rejection thread |
| 3 | Ship iOS build that uses Cloud Run API URL | EAS production build (see `eas.json`) |
| 4 | Put demo phone/code in Review Notes | App Store Connect → version → App Review Information |
| 5 | Confirm demo login on **iPad** TestFlight before submit | Physical iPad or simulator + production API |

### Review Notes (short)

```
Demo login (reusable, no WhatsApp required):
Phone: 082 109 9999
Code: 847291
Steps: accept terms → enter phone → Send WhatsApp Code → enter 847291 → signed in.

Age confirmation (optional check): Newsfeed tab → “Confirm your age” if prompted.

No IAP. Business software is sold only on https://lekker.network (web).
```
