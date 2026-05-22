-- Add driver reminder columns to tasks table
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS driver_reminder_hours numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS driver_reminder_repeat_min integer DEFAULT NULL;

-- driver_reminder_hours: how many hours before planned_start to start reminding
-- driver_reminder_repeat_min: repeat interval in minutes (NULL = single reminder)
-- Example: driver_reminder_hours=5, driver_reminder_repeat_min=30
--   means "remind driver starting 5h before, then every 30min until start"

COMMENT ON COLUMN tasks.driver_reminder_hours IS 'Hours before planned_start to begin driver reminders';
COMMENT ON COLUMN tasks.driver_reminder_repeat_min IS 'Repeat interval in minutes for driver reminders (NULL = once)';
