# Schema apply (deploy ≠ migrate)

**Repo:** Digital-Studio-Hub/LEKKER-APP-CHAT  
**Rule:** Shipping code does not create database columns/tables.

## What
Apply pending SQL (or this repo’s sanctioned migrate path) so the live database matches the code.

## Why
Deploy / Publish / Cloud Run / EAS only ships application code. Missing migrations → `column does not exist` and broken features.

## Where
- **Mobile:** Expo / EAS (`eas build`, App Store / Play) — ships the client only; never migrates SQL.
- **Backend host:** Cloud Run service `lekker-chat` (`europe-west1`) via `cloudbuild.yaml` (and/or Replit backend for some workflows).
- **Database:** Neon PostgreSQL (`DATABASE_URL` — pooled). Apply SQL here with `psql` (or the sanctioned script) against the **target** Neon DB — not via EAS Publish or Cloud Run deploy.
- **Migrations folder:** `migrations/` — keep this table updated when migrations are added:

| File | Notes |
|------|--------|
| `migrations/20260727_phone_primary_identity.sql` | Phone primary identity |
| `migrations/20260913_notification_preferences.sql` | Notification preferences |
| `migrations/20260913_personal_care_settings.sql` | Personal care settings |
| `migrations/20260913_reply_to_message.sql` | Reply-to message |

Pending vs applied is environment-specific: verify on the target Neon DB before shipping features that depend on new columns.

## Definition of done
1. Migrations applied on the target environment
2. Verify columns/tables exist
3. Smoke QA the feature
4. Then optional redeploy if the running build is behind main

## When you add a migration
Update this file in the same PR.
