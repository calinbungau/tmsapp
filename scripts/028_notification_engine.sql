-- ============================================================
-- Scalable Notification Engine
-- Supports: Web (in-app), Email, FCM Push
-- Triggered by: User actions, Background jobs, Automation rules
-- ============================================================

-- 1. notification_rules: Define automated notification triggers
-- Example: "Notify when task is late", "Remind driver 1h before task"
CREATE TABLE IF NOT EXISTS notification_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES admins(id),
  
  -- What triggers this rule
  trigger_event TEXT NOT NULL, -- 'task.dispatched', 'task.completed', 'task.late', 'task.status_changed', 'maintenance.due', 'document.expiring', etc.
  
  -- Conditions (JSONB for flexibility)
  -- e.g. {"task_type_id": "xxx", "priority": ["high","urgent"]}
  conditions JSONB DEFAULT '{}',
  
  -- Who to notify
  recipient_type TEXT NOT NULL, -- 'task_creator', 'task_subscribers', 'role', 'department', 'all_users', 'specific_user', 'task_driver'
  recipient_id UUID, -- role_id, department_id, or user_id depending on recipient_type
  
  -- Channels to use
  channel_web BOOLEAN DEFAULT true,
  channel_email BOOLEAN DEFAULT false,
  channel_push BOOLEAN DEFAULT true,
  
  -- Template
  title_template TEXT NOT NULL, -- supports {{task.title}}, {{driver.name}}, etc.
  body_template TEXT NOT NULL,
  icon TEXT DEFAULT 'bell',
  priority TEXT DEFAULT 'normal', -- low, normal, high, urgent
  action_url_template TEXT, -- e.g. '/admin/fsm/tasks?id={{task.id}}'
  
  -- Timing
  delay_minutes INTEGER DEFAULT 0, -- 0 = immediate, 60 = 1h before, etc.
  
  -- Module access restriction
  required_module TEXT, -- 'fleet', 'hr', 'maintenance', etc. Null = no restriction
  
  is_active BOOLEAN DEFAULT true,
  is_system BOOLEAN DEFAULT false, -- system rules can't be deleted
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. task_notification_subscribers: Per-task subscriber list
CREATE TABLE IF NOT EXISTS task_notification_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  
  -- What events to notify for this task
  notify_on_dispatch BOOLEAN DEFAULT true,
  notify_on_status_change BOOLEAN DEFAULT true,
  notify_on_completion BOOLEAN DEFAULT true,
  notify_on_late BOOLEAN DEFAULT true,
  notify_on_driver_action BOOLEAN DEFAULT true, -- driver accepted/declined/started
  
  -- Channels override (null = use user's default preferences)
  channel_web BOOLEAN DEFAULT true,
  channel_email BOOLEAN,
  channel_push BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(task_id, user_id)
);

-- 3. notification_queue: For delayed/scheduled notifications
CREATE TABLE IF NOT EXISTS notification_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES admins(id),
  
  -- Target
  user_id UUID REFERENCES users(id),
  driver_id UUID REFERENCES drivers(id),
  
  -- Payload
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  icon TEXT DEFAULT 'bell',
  priority TEXT DEFAULT 'normal',
  action_url TEXT,
  notification_type TEXT NOT NULL,
  data JSONB DEFAULT '{}',
  
  -- Channels
  channel_web BOOLEAN DEFAULT true,
  channel_email BOOLEAN DEFAULT false,
  channel_push BOOLEAN DEFAULT true,
  
  -- Scheduling
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending', -- pending, processing, sent, failed, cancelled
  error_message TEXT,
  
  -- Source tracking
  source_type TEXT, -- 'rule', 'action', 'cron'
  source_id UUID, -- notification_rule id
  entity_type TEXT, -- 'task', 'maintenance', 'document'
  entity_id UUID,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_notification_rules_admin ON notification_rules(admin_id, is_active);
CREATE INDEX IF NOT EXISTS idx_notification_rules_trigger ON notification_rules(trigger_event, is_active);
CREATE INDEX IF NOT EXISTS idx_task_notif_subs_task ON task_notification_subscribers(task_id);
CREATE INDEX IF NOT EXISTS idx_task_notif_subs_user ON task_notification_subscribers(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_queue_scheduled ON notification_queue(status, scheduled_for) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_notification_queue_entity ON notification_queue(entity_type, entity_id);

-- RLS Policies
ALTER TABLE notification_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_notification_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_queue ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'notification_rules_all') THEN
    CREATE POLICY notification_rules_all ON notification_rules FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'task_notif_subs_all') THEN
    CREATE POLICY task_notif_subs_all ON task_notification_subscribers FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'notification_queue_all') THEN
    CREATE POLICY notification_queue_all ON notification_queue FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 4. Insert default system notification rules
INSERT INTO notification_rules (admin_id, trigger_event, recipient_type, channel_web, channel_push, channel_email, title_template, body_template, icon, priority, action_url_template, is_system, is_active, required_module)
VALUES
  -- Task dispatched -> notify task subscribers
  (NULL, 'task.dispatched', 'task_subscribers', true, true, false,
   'Task Dispatched: {{task.reference_number}}',
   '{{task.title}} has been dispatched to {{driver.name}}',
   'send', 'normal', '/admin/fsm/tasks?id={{task.id}}', true, true, 'fleet'),

  -- Task completed -> notify task subscribers
  (NULL, 'task.completed', 'task_subscribers', true, true, false,
   'Task Completed: {{task.reference_number}}',
   '{{task.title}} has been completed by {{driver.name}}',
   'check-circle', 'normal', '/admin/fsm/tasks?id={{task.id}}', true, true, 'fleet'),

  -- Task late -> notify task subscribers
  (NULL, 'task.late', 'task_subscribers', true, true, true,
   'Task Running Late: {{task.reference_number}}',
   '{{task.title}} is past its planned start time',
   'alert-triangle', 'high', '/admin/fsm/tasks?id={{task.id}}', true, true, 'fleet'),

  -- Driver accepted task
  (NULL, 'task.driver_accepted', 'task_subscribers', true, false, false,
   'Driver Accepted: {{task.reference_number}}',
   '{{driver.name}} accepted task {{task.title}}',
   'user-check', 'normal', '/admin/fsm/tasks?id={{task.id}}', true, true, 'fleet'),

  -- Driver declined task
  (NULL, 'task.driver_declined', 'task_subscribers', true, true, false,
   'Driver Declined: {{task.reference_number}}',
   '{{driver.name}} declined task {{task.title}}',
   'user-x', 'high', '/admin/fsm/tasks?id={{task.id}}', true, true, 'fleet'),

  -- Task started
  (NULL, 'task.started', 'task_subscribers', true, false, false,
   'Task Started: {{task.reference_number}}',
   '{{driver.name}} started working on {{task.title}}',
   'play-circle', 'normal', '/admin/fsm/tasks?id={{task.id}}', true, true, 'fleet'),

  -- Remind driver before task
  (NULL, 'task.driver_reminder', 'task_driver', true, true, false,
   'Upcoming Task: {{task.reference_number}}',
   'Task {{task.title}} starts in {{reminder.time_before}}',
   'clock', 'normal', NULL, true, true, NULL),

  -- Maintenance due
  (NULL, 'maintenance.due', 'role', true, true, true,
   'Maintenance Due: {{vehicle.plate_number}}',
   '{{maintenance.type}} is due for {{vehicle.plate_number}}',
   'wrench', 'high', '/admin/maintenance', true, true, 'maintenance'),

  -- Document expiring
  (NULL, 'document.expiring', 'role', true, true, true,
   'Document Expiring: {{document.name}}',
   '{{document.name}} for {{entity.name}} expires in {{document.days_until}} days',
   'file-warning', 'normal', '/admin/documents', true, true, NULL)

ON CONFLICT DO NOTHING;

-- 5. Add task_type_id to tasks if not exists (already exists, skip)
-- Already has task_type_id

-- Enable realtime on user_notifications for live badge updates
ALTER PUBLICATION supabase_realtime ADD TABLE user_notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE notification_queue;
