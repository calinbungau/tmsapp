-- Add filled_by column to distinguish dispatcher forms from driver forms
ALTER TABLE task_forms ADD COLUMN IF NOT EXISTS filled_by TEXT NOT NULL DEFAULT 'driver' CHECK (filled_by IN ('driver', 'dispatcher'));

-- Add task reference number sequence per admin
CREATE SEQUENCE IF NOT EXISTS task_ref_seq START 1;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reference_number TEXT;
