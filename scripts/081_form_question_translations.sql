-- Add translations JSONB column to form_questions
-- Stores per-language translations of question_text and description
-- Format: { "ro": { "question_text": "...", "description": "..." }, "de": { ... } }
-- The original question_text/description columns remain as the default/fallback (English)

ALTER TABLE form_questions
ADD COLUMN IF NOT EXISTS translations jsonb DEFAULT NULL;

-- Add a comment for documentation
COMMENT ON COLUMN form_questions.translations IS 'JSONB map of language_code -> { question_text, description, options (for select/radio/checkbox) }. Fallback is the main question_text column.';

-- Also add translations to form_templates for the form title/description
ALTER TABLE form_templates
ADD COLUMN IF NOT EXISTS translations jsonb DEFAULT NULL;

COMMENT ON COLUMN form_templates.translations IS 'JSONB map of language_code -> { title, description }. Fallback is the main title/description columns.';
