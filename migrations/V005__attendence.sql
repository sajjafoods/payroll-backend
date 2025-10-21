
-- =====================================================
-- ATTENDANCE MANAGEMENT MODULE - DATABASE SCHEMA
-- =====================================================
-- Project: AI-First Payroll Management System
-- Database: PostgreSQL 15 (Supabase)
-- Migration: V4__create_attendance_management_module.sql
-- Dependencies: V1 (Organizations), V2 (Users), V3 (Employees)
-- =====================================================

-- =====================================================
-- TABLE: attendance_records
-- =====================================================
-- Description: Daily attendance tracking with integrated leave management
-- Relationships: 
--   - Many-to-One with employees
--   - Many-to-One with organizations
--   - Many-to-One with users (created_by, updated_by)
-- =====================================================

CREATE TABLE attendance_records (
    -- Primary Key
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Foreign Keys
    organization_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    employee_id             UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    
    -- Attendance Details
    date                    DATE NOT NULL,
    status                  VARCHAR(20) NOT NULL CHECK (status IN ('present', 'absent', 'half_day', 'on_leave')),
    notes                   TEXT,
    
    -- Leave-Specific Fields (populated only when status='on_leave')
    leave_days              DECIMAL(3,1) CHECK (leave_days IN (0.5, 1.0)),
    leave_type              VARCHAR(20) CHECK (leave_type IN ('casual', 'sick', 'earned', 'unpaid', 'other')),
    is_paid_leave           BOOLEAN DEFAULT true,
    balance_before          DECIMAL(5,1),
    balance_after           DECIMAL(5,1),
    
    -- Audit Fields
    created_by_user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at              TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_by_user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at              TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT unique_employee_date UNIQUE (employee_id, date),
    CONSTRAINT leave_fields_required CHECK (
        (status = 'on_leave' AND leave_days IS NOT NULL AND leave_type IS NOT NULL) OR
        (status != 'on_leave' AND leave_days IS NULL AND leave_type IS NULL AND balance_before IS NULL AND balance_after IS NULL)
    )
);

-- =====================================================
-- TABLE: employee_leave_balances
-- =====================================================
-- Description: Current leave balance and accrual policy per employee
-- Relationships: One-to-One with employees
-- =====================================================

CREATE TABLE employee_leave_balances (
    -- Primary Key (also FK to employees)
    employee_id             UUID PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
    
    -- Foreign Key
    organization_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- Current Balance
    total_balance           DECIMAL(5,1) NOT NULL DEFAULT 0.0 CHECK (total_balance >= 0),
    
    -- Accrual Policy
    accrual_type            VARCHAR(20) DEFAULT 'none' CHECK (accrual_type IN ('monthly', 'annual', 'none')),
    accrual_rate            DECIMAL(4,1) DEFAULT 0.0 CHECK (accrual_rate >= 0),
    max_balance             DECIMAL(5,1) DEFAULT 30.0 CHECK (max_balance > 0),
    effective_from          DATE,
    
    -- Year-to-Date Statistics
    ytd_leaves_taken        DECIMAL(5,1) NOT NULL DEFAULT 0.0,
    ytd_leaves_accrued      DECIMAL(5,1) NOT NULL DEFAULT 0.0,
    last_accrual_date       DATE,
    
    -- Audit Fields
    created_at              TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- TABLE: leave_balance_history
-- =====================================================
-- Description: Complete audit trail of all leave balance changes
-- Relationships: Many-to-One with employees
-- =====================================================

CREATE TABLE leave_balance_history (
    -- Primary Key
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Foreign Keys
    organization_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    employee_id             UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    attendance_record_id    UUID REFERENCES attendance_records(id) ON DELETE SET NULL,
    
    -- Balance Change Details
    change_type             VARCHAR(30) NOT NULL CHECK (change_type IN (
        'leave_deduction',      -- Auto: Leave taken
        'leave_restoration',    -- Auto: Leave record deleted
        'accrual',              -- Auto: Monthly/annual accrual
        'manual_adjustment',    -- Manual: Admin correction
        'initial_setup',        -- Manual: Initial balance setup
        'bonus',                -- Manual: Bonus leaves
        'carry_forward'         -- Manual: Year-end carry forward
    )),
    balance_before          DECIMAL(5,1) NOT NULL,
    balance_change          DECIMAL(5,1) NOT NULL,
    balance_after           DECIMAL(5,1) NOT NULL,
    reason                  TEXT NOT NULL,
    notes                   TEXT,
    
    -- Audit Fields
    changed_by_user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
    changed_at              TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Attendance Records Indexes

-- Most common query: Get attendance by organization and date range
CREATE INDEX idx_attendance_org_date ON attendance_records(organization_id, date DESC);

-- Query by employee and date range (employee attendance history)
CREATE INDEX idx_attendance_employee_date ON attendance_records(employee_id, date DESC);

-- Filter by status (e.g., get all leaves)
CREATE INDEX idx_attendance_org_status ON attendance_records(organization_id, status);

-- Leave-specific queries
CREATE INDEX idx_attendance_leaves ON attendance_records(organization_id, leave_type) 
    WHERE status = 'on_leave';

-- Paid vs unpaid leaves
CREATE INDEX idx_attendance_paid_leaves ON attendance_records(organization_id, is_paid_leave) 
    WHERE status = 'on_leave';

-- Composite index for month/year queries
CREATE INDEX idx_attendance_org_month ON attendance_records(organization_id, EXTRACT(YEAR FROM date), EXTRACT(MONTH FROM date));

-- Audit trail: created by user
CREATE INDEX idx_attendance_created_by ON attendance_records(created_by_user_id);

-- Employee Leave Balances Indexes

-- Query by organization
CREATE INDEX idx_leave_balance_org ON employee_leave_balances(organization_id);

-- Find employees with accrual policies
CREATE INDEX idx_leave_balance_accrual_type ON employee_leave_balances(accrual_type) 
    WHERE accrual_type != 'none';

-- Find employees needing accrual processing
CREATE INDEX idx_leave_balance_accrual_pending ON employee_leave_balances(last_accrual_date, accrual_type) 
    WHERE accrual_type IN ('monthly', 'annual');

-- Leave Balance History Indexes

-- Get history for an employee
CREATE INDEX idx_balance_history_employee ON leave_balance_history(employee_id, changed_at DESC);

-- Query by organization
CREATE INDEX idx_balance_history_org ON leave_balance_history(organization_id, changed_at DESC);

-- Filter by change type
CREATE INDEX idx_balance_history_type ON leave_balance_history(change_type);

-- Audit trail: changed by user
CREATE INDEX idx_balance_history_changed_by ON leave_balance_history(changed_by_user_id);

-- =====================================================
-- TRIGGERS FOR AUTOMATIC TIMESTAMP UPDATES
-- =====================================================

-- Trigger for attendance_records table (reuses function from organizations module)
CREATE TRIGGER update_attendance_records_updated_at 
    BEFORE UPDATE ON attendance_records 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for employee_leave_balances table
CREATE TRIGGER update_employee_leave_balances_updated_at 
    BEFORE UPDATE ON employee_leave_balances 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- TRIGGER FOR AUTOMATIC LEAVE BALANCE CREATION
-- =====================================================

-- When a new employee is created, automatically create leave balance record
CREATE OR REPLACE FUNCTION create_employee_leave_balance()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO employee_leave_balances (
        employee_id,
        organization_id,
        total_balance,
        accrual_type,
        accrual_rate,
        max_balance
    )
    VALUES (
        NEW.id,
        NEW.organization_id,
        0.0,
        'none',
        0.0,
        30.0
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER create_leave_balance_on_employee_insert
    AFTER INSERT ON employees
    FOR EACH ROW
    EXECUTE FUNCTION create_employee_leave_balance();

-- =====================================================
-- ROW-LEVEL SECURITY (RLS)
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_leave_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_balance_history ENABLE ROW LEVEL SECURITY;

-- Policy: Users can see attendance from their organizations
CREATE POLICY attendance_org_member_access ON attendance_records
    FOR ALL
    USING (
        organization_id IN (
            SELECT organization_id 
            FROM organization_users 
            WHERE user_id = current_setting('app.current_user_id', true)::uuid
            AND is_active = true
        )
        OR current_setting('app.bypass_rls', true) = 'true'
    );

-- Policy: Users can see leave balances for employees in their organizations
CREATE POLICY leave_balance_org_member_access ON employee_leave_balances
    FOR ALL
    USING (
        organization_id IN (
            SELECT organization_id 
            FROM organization_users 
            WHERE user_id = current_setting('app.current_user_id', true)::uuid
            AND is_active = true
        )
        OR current_setting('app.bypass_rls', true) = 'true'
    );

-- Policy: Users can see balance history for employees in their organizations
CREATE POLICY balance_history_org_member_access ON leave_balance_history
    FOR ALL
    USING (
        organization_id IN (
            SELECT organization_id 
            FROM organization_users 
            WHERE user_id = current_setting('app.current_user_id', true)::uuid
            AND is_active = true
        )
        OR current_setting('app.bypass_rls', true) = 'true'
    );

-- =====================================================
-- COMMENTS (Schema Documentation)
-- =====================================================

COMMENT ON TABLE attendance_records IS 
    'Daily attendance tracking with integrated leave management. When status=on_leave, additional leave fields are populated and balance is automatically deducted.';

COMMENT ON COLUMN attendance_records.id IS 
    'Unique identifier for the attendance record (UUID).';

COMMENT ON COLUMN attendance_records.status IS 
    'Attendance status: present (working), absent (no show), half_day (partial day), on_leave (approved leave with balance deduction).';

COMMENT ON COLUMN attendance_records.leave_days IS 
    'Number of leave days (only for status=on_leave): 0.5 for half day, 1.0 for full day.';

COMMENT ON COLUMN attendance_records.leave_type IS 
    'Leave category (only for status=on_leave): casual, sick, earned, unpaid, other.';

COMMENT ON COLUMN attendance_records.is_paid_leave IS 
    'Whether the leave is paid (balance available) or unpaid (no balance). Auto-calculated on leave marking.';

COMMENT ON COLUMN attendance_records.balance_before IS 
    'Leave balance before this record was created (snapshot for audit).';

COMMENT ON COLUMN attendance_records.balance_after IS 
    'Leave balance after deduction (snapshot for audit).';

COMMENT ON TABLE employee_leave_balances IS 
    'Current leave balance and accrual policy per employee. One record per employee, automatically created on employee creation.';

COMMENT ON COLUMN employee_leave_balances.total_balance IS 
    'Current available leave balance. Automatically updated on leave deduction/restoration/accrual.';

COMMENT ON COLUMN employee_leave_balances.accrual_type IS 
    'Leave accrual frequency: monthly (e.g., 1.5 days/month), annual (e.g., 18 days/year), none (manual management only).';

COMMENT ON COLUMN employee_leave_balances.accrual_rate IS 
    'Number of days accrued per period. Example: monthly=1.5 means 1.5 days added every month.';

COMMENT ON COLUMN employee_leave_balances.max_balance IS 
    'Maximum leave balance cap. Prevents unlimited accumulation. Default 30 days.';

COMMENT ON COLUMN employee_leave_balances.ytd_leaves_taken IS 
    'Year-to-date total leaves taken (resets at year start).';

COMMENT ON COLUMN employee_leave_balances.ytd_leaves_accrued IS 
    'Year-to-date total leaves accrued (resets at year start).';

COMMENT ON COLUMN employee_leave_balances.last_accrual_date IS 
    'Date when last accrual was processed. Used to prevent duplicate accruals.';

COMMENT ON TABLE leave_balance_history IS 
    'Complete audit trail of all leave balance changes. Tracks every deduction, restoration, accrual, and manual adjustment with reason and timestamp.';

COMMENT ON COLUMN leave_balance_history.change_type IS 
    'Type of balance change: leave_deduction (leave taken), leave_restoration (leave deleted), accrual (monthly/annual), manual_adjustment (admin correction), initial_setup, bonus, carry_forward.';

COMMENT ON COLUMN leave_balance_history.reason IS 
    'Reason for balance change. Auto-generated for system changes, manually entered for adjustments.';
-- =====================================================
-- END OF MIGRATION
-- =====================================================    