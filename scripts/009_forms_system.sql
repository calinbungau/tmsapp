-- Forms System Schema for scalable questionnaires
-- Supports: Daily, Weekly, Monthly inspections + On-demand forms (Maintenance, Accident, Custom)

-- Form Templates table - defines the structure of each form
CREATE TABLE IF NOT EXISTS form_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES admins(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  -- Frequency: daily, weekly, monthly, on_demand
  frequency VARCHAR(20) NOT NULL DEFAULT 'daily',
  -- Form type for categorization: inspection, maintenance, accident, custom
  form_type VARCHAR(50) NOT NULL DEFAULT 'inspection',
  -- For weekly forms: which day (0=Sunday, 1=Monday, etc.)
  day_of_week INTEGER,
  -- For monthly forms: which day of month (1-31)
  day_of_month INTEGER,
  is_active BOOLEAN DEFAULT true,
  requires_vehicle BOOLEAN DEFAULT true,
  requires_photo_signature BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Form Questions table - individual questions within a form
CREATE TABLE IF NOT EXISTS form_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_template_id UUID REFERENCES form_templates(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  -- Question types: yes_no, photo, text, number, select
  question_type VARCHAR(20) NOT NULL DEFAULT 'yes_no',
  -- For select type: JSON array of options
  options JSONB,
  is_required BOOLEAN DEFAULT true,
  order_index INTEGER NOT NULL DEFAULT 0,
  -- Help text shown below the question
  help_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Form Submissions table - when a driver submits a form
CREATE TABLE IF NOT EXISTS form_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_template_id UUID REFERENCES form_templates(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES drivers(id) ON DELETE CASCADE,
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  admin_id UUID REFERENCES admins(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'in_progress', -- in_progress, completed, reviewed
  -- For tracking location
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  location_accuracy DECIMAL(10, 2),
  -- Signature if required
  signature_url TEXT,
  notes TEXT,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Form Answers table - individual answers to questions
CREATE TABLE IF NOT EXISTS form_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID REFERENCES form_submissions(id) ON DELETE CASCADE,
  question_id UUID REFERENCES form_questions(id) ON DELETE CASCADE,
  -- Store answer based on question type
  answer_text TEXT,
  answer_boolean BOOLEAN,
  answer_number DECIMAL(15, 2),
  answer_photo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_form_templates_admin ON form_templates(admin_id);
CREATE INDEX IF NOT EXISTS idx_form_templates_frequency ON form_templates(frequency);
CREATE INDEX IF NOT EXISTS idx_form_questions_template ON form_questions(form_template_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_driver ON form_submissions(driver_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_template ON form_submissions(form_template_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_date ON form_submissions(created_at);
CREATE INDEX IF NOT EXISTS idx_form_answers_submission ON form_answers(submission_id);

-- Create a default Daily Inspection form for existing admins
INSERT INTO form_templates (admin_id, name, description, frequency, form_type, requires_vehicle, requires_photo_signature)
SELECT 
  id,
  'Daily Vehicle Inspection',
  'Standard daily vehicle inspection checklist',
  'daily',
  'inspection',
  true,
  true
FROM admins
WHERE NOT EXISTS (
  SELECT 1 FROM form_templates WHERE form_templates.admin_id = admins.id AND form_type = 'inspection'
);

-- Add default questions to the daily inspection form
INSERT INTO form_questions (form_template_id, question_text, question_type, is_required, order_index)
SELECT 
  ft.id,
  q.question_text,
  q.question_type,
  q.is_required,
  q.order_index
FROM form_templates ft
CROSS JOIN (
  VALUES 
    ('Vehicle Front Right Photo', 'photo', true, 1),
    ('Vehicle Front Left Photo', 'photo', true, 2),
    ('Vehicle Back Right Photo', 'photo', true, 3),
    ('Vehicle Back Left Photo', 'photo', true, 4),
    ('Vehicle Interior Photo', 'photo', true, 5),
    ('Driver License Front Photo', 'photo', true, 6),
    ('Driver License Back Photo', 'photo', true, 7),
    ('GISA License Photo', 'photo', true, 8),
    ('Are all lights working properly?', 'yes_no', true, 9),
    ('Are tires in good condition?', 'yes_no', true, 10),
    ('Is the vehicle clean?', 'yes_no', true, 11),
    ('Any visible damage?', 'yes_no', true, 12)
) AS q(question_text, question_type, is_required, order_index)
WHERE ft.form_type = 'inspection' AND ft.frequency = 'daily'
AND NOT EXISTS (
  SELECT 1 FROM form_questions WHERE form_questions.form_template_id = ft.id
);
