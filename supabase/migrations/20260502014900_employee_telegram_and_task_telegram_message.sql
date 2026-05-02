-- Add Telegram user ID to employees so the bot can send personal DMs and verify button presses.
-- The column is nullable so existing employees are unaffected until a value is entered in HR.
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS telegram_user_id text UNIQUE;

-- Store the Telegram message_id of the private DM sent to the assignee when a task is created.
-- Used later to edit the message (replace the button with a ✅ Done indicator) after completion.
ALTER TABLE todo_tasks
  ADD COLUMN IF NOT EXISTS todo_telegram_message_id text;
