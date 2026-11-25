-- Token provider for push delivery. expo/fcm/apns use the Expo push service.
-- hms uses Huawei Push Kit. Existing rows default to expo.
-- Apply on the target Neon database before deploying a server that writes this column.
ALTER TABLE push_tokens
  ADD COLUMN IF NOT EXISTS provider varchar(16) NOT NULL DEFAULT 'expo';
