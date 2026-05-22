-- Enable realtime for task-related tables so admin task list and detail panel update instantly

-- task_stops: stop status changes, new stops
ALTER TABLE task_stops REPLICA IDENTITY FULL;
DO $$ BEGIN
ALTER PUBLICATION supabase_realtime ADD TABLE task_stops;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- task_status_history: activity feed updates
ALTER TABLE task_status_history REPLICA IDENTITY FULL;
DO $$ BEGIN
ALTER PUBLICATION supabase_realtime ADD TABLE task_status_history;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- task_comments: new comments
ALTER TABLE task_comments REPLICA IDENTITY FULL;
DO $$ BEGIN
ALTER PUBLICATION supabase_realtime ADD TABLE task_comments;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- stop_form_submissions: new form submissions from drivers
ALTER TABLE stop_form_submissions REPLICA IDENTITY FULL;
DO $$ BEGIN
ALTER PUBLICATION supabase_realtime ADD TABLE stop_form_submissions;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
