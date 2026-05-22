-- ============================================
-- AI Extraction Logs + Company Profile Limits
-- 038_ai_extraction_logs.sql
-- ============================================

-- AI extraction tracking table
CREATE TABLE IF NOT EXISTS ai_extraction_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,

  -- Document info
  document_name TEXT NOT NULL,
  document_type TEXT DEFAULT 'pdf',
  page_count INTEGER DEFAULT 1,
  relevant_pages INTEGER[] DEFAULT '{}',

  -- Token tracking: classification step
  classification_input_tokens INTEGER DEFAULT 0,
  classification_output_tokens INTEGER DEFAULT 0,
  classification_model TEXT,

  -- Token tracking: extraction step
  extraction_input_tokens INTEGER DEFAULT 0,
  extraction_output_tokens INTEGER DEFAULT 0,
  extraction_model TEXT,

  -- Totals
  total_input_tokens INTEGER GENERATED ALWAYS AS (classification_input_tokens + extraction_input_tokens) STORED,
  total_output_tokens INTEGER GENERATED ALWAYS AS (classification_output_tokens + extraction_output_tokens) STORED,
  total_tokens INTEGER GENERATED ALWAYS AS (classification_input_tokens + classification_output_tokens + extraction_input_tokens + extraction_output_tokens) STORED,

  -- Cost
  estimated_cost_usd NUMERIC(10,6) DEFAULT 0,

  -- Performance
  processing_time_ms INTEGER DEFAULT 0,
  extraction_confidence INTEGER DEFAULT 0 CHECK (extraction_confidence BETWEEN 0 AND 100),
  was_corrected BOOLEAN DEFAULT FALSE,

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','classifying','extracting','completed','failed')),
  error_message TEXT,

  -- Raw data
  extracted_data JSONB,
  final_data JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ai_extraction_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_extraction_logs_all" ON ai_extraction_logs FOR ALL USING (true) WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ai_extraction_logs_admin ON ai_extraction_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_ai_extraction_logs_order ON ai_extraction_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_ai_extraction_logs_created ON ai_extraction_logs(created_at);

-- Add AI monthly limit to company_profiles
ALTER TABLE company_profiles ADD COLUMN IF NOT EXISTS ai_monthly_limit_usd NUMERIC(10,2) DEFAULT 50.00;
ALTER TABLE company_profiles ADD COLUMN IF NOT EXISTS ai_monthly_warning_pct INTEGER DEFAULT 80;
