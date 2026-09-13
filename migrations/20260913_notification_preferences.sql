-- Per-category Expo push preferences (JSON on users)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS notification_preferences text;
