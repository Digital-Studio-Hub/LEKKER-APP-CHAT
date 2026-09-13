-- Personal Settings / Companion care (PIN stays on device; prefs sync for cron)

CREATE TABLE IF NOT EXISTS personal_care_settings (
  user_id varchar(36) PRIMARY KEY,
  safe_browse_enabled boolean NOT NULL DEFAULT false,
  companion_enabled boolean NOT NULL DEFAULT false,
  companion_profile varchar(40) NOT NULL DEFAULT 'dementia',
  check_in_interval_hours integer NOT NULL DEFAULT 4,
  silence_alert_after_hours integer NOT NULL DEFAULT 4,
  family_contact_user_id varchar(36),
  last_patient_reply_at timestamp,
  last_check_in_sent_at timestamp,
  last_family_alert_sent_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_personal_care_companion ON personal_care_settings (companion_enabled);
CREATE INDEX IF NOT EXISTS idx_personal_care_family ON personal_care_settings (family_contact_user_id);
