-- Make maintenance_type_id nullable so drivers can report issues without specifying a type
-- The admin will assign the maintenance type later during review

ALTER TABLE maintenance_records 
ALTER COLUMN maintenance_type_id DROP NOT NULL;
