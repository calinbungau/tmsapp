-- Adds custom per-rule email recipients to Action Center definitions.
-- These are appended to (or, depending on policy, can replace) the
-- role-based recipient list when an alert fires with email enabled.
ALTER TABLE action_center_definitions
  ADD COLUMN IF NOT EXISTS email_recipients jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN action_center_definitions.email_recipients IS
  'Custom email addresses to notify in addition to role-based assignees. JSONB array of strings.';
