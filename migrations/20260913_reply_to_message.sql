ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS reply_to_message_id varchar(36);
