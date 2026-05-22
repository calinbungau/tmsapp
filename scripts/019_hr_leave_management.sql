-- HR Leave Management System
-- Tables: leave_types, leave_policies, leave_entitlements, leave_requests, public_holidays

-- 1. Leave Types (configurable per company)
CREATE TABLE IF NOT EXISTS leave_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL, -- e.g., 'annual', 'medical', 'unpaid', 'maternity'
  description TEXT,
  is_paid BOOLEAN NOT NULL DEFAULT true,
  requires_approval BOOLEAN NOT NULL DEFAULT true,
  requires_document BOOLEAN NOT NULL DEFAULT false,
  document_required_after_days INTEGER, -- e.g., medical cert after 3 days
  max_days_per_year INTEGER, -- null = unlimited
  color TEXT DEFAULT '#3b82f6', -- for calendar display
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Leave Policies (entitlement rules per company)
CREATE TABLE IF NOT EXISTS leave_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Default Policy',
  base_annual_days INTEGER NOT NULL DEFAULT 21, -- starting annual leave days
  seniority_bonus_days INTEGER DEFAULT 1, -- extra days per seniority threshold
  seniority_bonus_years INTEGER DEFAULT 2, -- every X years of service
  max_annual_days INTEGER DEFAULT 30, -- cap on annual leave
  carry_over_max_days INTEGER DEFAULT 5, -- max unused days to carry over
  carry_over_expiry_months INTEGER DEFAULT 3, -- carry over expires after X months into new year
  probation_months INTEGER DEFAULT 0, -- no leave during probation
  accrual_method TEXT NOT NULL DEFAULT 'yearly', -- 'yearly', 'monthly', 'from_hire_date'
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Leave Entitlements (per employee per year - auto-calculated)
CREATE TABLE IF NOT EXISTS leave_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type_id UUID NOT NULL REFERENCES leave_types(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  total_entitled_days NUMERIC(5,1) NOT NULL DEFAULT 0, -- includes prorated + seniority + carry-over
  carried_over_days NUMERIC(5,1) NOT NULL DEFAULT 0,
  used_days NUMERIC(5,1) NOT NULL DEFAULT 0,
  pending_days NUMERIC(5,1) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(employee_id, leave_type_id, year)
);

-- 4. Leave Requests
CREATE TABLE IF NOT EXISTS leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type_id UUID NOT NULL REFERENCES leave_types(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  start_half_day TEXT, -- 'morning', 'afternoon', null = full day
  end_half_day TEXT, -- 'morning', 'afternoon', null = full day
  total_days NUMERIC(5,1) NOT NULL, -- calculated excluding weekends + holidays
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'cancelled'
  attachment_url TEXT, -- medical certificate etc.
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Public Holidays Calendar
CREATE TABLE IF NOT EXISTS public_holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  date DATE NOT NULL,
  year INTEGER NOT NULL,
  is_recurring BOOLEAN NOT NULL DEFAULT false, -- same date every year
  country TEXT, -- optional, for multi-country
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_leave_types_admin ON leave_types(admin_id);
CREATE INDEX IF NOT EXISTS idx_leave_policies_admin ON leave_policies(admin_id);
CREATE INDEX IF NOT EXISTS idx_leave_entitlements_admin ON leave_entitlements(admin_id);
CREATE INDEX IF NOT EXISTS idx_leave_entitlements_employee_year ON leave_entitlements(employee_id, year);
CREATE INDEX IF NOT EXISTS idx_leave_requests_admin ON leave_requests(admin_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_employee ON leave_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_leave_requests_dates ON leave_requests(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_public_holidays_admin_year ON public_holidays(admin_id, year);

-- Enable RLS
ALTER TABLE leave_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public_holidays ENABLE ROW LEVEL SECURITY;

-- RLS Policies (same permissive pattern as other tables)
CREATE POLICY "Allow public read on leave_types" ON leave_types FOR SELECT USING (true);
CREATE POLICY "Allow public insert on leave_types" ON leave_types FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on leave_types" ON leave_types FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on leave_types" ON leave_types FOR DELETE USING (true);

CREATE POLICY "Allow public read on leave_policies" ON leave_policies FOR SELECT USING (true);
CREATE POLICY "Allow public insert on leave_policies" ON leave_policies FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on leave_policies" ON leave_policies FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on leave_policies" ON leave_policies FOR DELETE USING (true);

CREATE POLICY "Allow public read on leave_entitlements" ON leave_entitlements FOR SELECT USING (true);
CREATE POLICY "Allow public insert on leave_entitlements" ON leave_entitlements FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on leave_entitlements" ON leave_entitlements FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on leave_entitlements" ON leave_entitlements FOR DELETE USING (true);

CREATE POLICY "Allow public read on leave_requests" ON leave_requests FOR SELECT USING (true);
CREATE POLICY "Allow public insert on leave_requests" ON leave_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on leave_requests" ON leave_requests FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on leave_requests" ON leave_requests FOR DELETE USING (true);

CREATE POLICY "Allow public read on public_holidays" ON public_holidays FOR SELECT USING (true);
CREATE POLICY "Allow public insert on public_holidays" ON public_holidays FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on public_holidays" ON public_holidays FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on public_holidays" ON public_holidays FOR DELETE USING (true);

-- Add leave_policy_id to employees table
ALTER TABLE employees ADD COLUMN IF NOT EXISTS leave_policy_id UUID REFERENCES leave_policies(id);

-- Add HR permission definitions
INSERT INTO permission_definitions (permission_key, name, description, module, sub_module, display_order)
VALUES 
  ('hr:view', 'View HR', 'View HR dashboard and leave data', 'hr', NULL, 1),
  ('hr:leave:approve', 'Approve Leave', 'Approve or reject leave requests', 'hr', 'leave', 2),
  ('hr:leave:manage', 'Manage Leave', 'Manage leave types, policies and entitlements', 'hr', 'leave', 3),
  ('hr:holidays:manage', 'Manage Holidays', 'Manage public holidays calendar', 'hr', 'holidays', 4)
ON CONFLICT DO NOTHING;
