-- Patch: Add missing columns for task_notification_subscribers 
-- that the frontend uses (notify_on_delay, channels array)

-- Add channels array column if not exists
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='task_notification_subscribers' AND column_name='channels') THEN
    ALTER TABLE task_notification_subscribers ADD COLUMN channels TEXT[] DEFAULT ARRAY['in_app', 'push'];
  END IF;
END $$;

-- Add notify_on_delay alias
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='task_notification_subscribers' AND column_name='notify_on_delay') THEN
    ALTER TABLE task_notification_subscribers ADD COLUMN notify_on_delay BOOLEAN DEFAULT true;
  END IF;
END $$;

-- Safely add user_notifications to realtime (ignore if already added)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE user_notifications;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- Safely add notification_queue to realtime
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE notification_queue;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;
