-- Phone is the only required unique identity for WhatsApp OTP accounts.
-- Email and username remain optional unique fields (NULL = not set).

ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users ALTER COLUMN username DROP NOT NULL;

-- Optional: soften empty names for existing rows is not required;
-- first_name / last_name keep defaults of empty string via app writes.
