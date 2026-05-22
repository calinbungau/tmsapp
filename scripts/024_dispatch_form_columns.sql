-- Add dispatch form fields to tasks and task_stops
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS dispatch_form_id UUID REFERENCES task_forms(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS dispatch_form_values JSONB DEFAULT '{}';

ALTER TABLE task_stops ADD COLUMN IF NOT EXISTS dispatch_stop_form_id UUID REFERENCES task_forms(id) ON DELETE SET NULL;
ALTER TABLE task_stops ADD COLUMN IF NOT EXISTS dispatch_stop_form_values JSONB DEFAULT '{}';
