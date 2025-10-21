-- =====================================================
-- EMPLOYEE MANAGEMENT MODULE - DATABASE SCHEMA
-- =====================================================
-- Project: AI-First Payroll Management System
-- Database: PostgreSQL 15 (Supabase)
-- Migration: V3__create_employee_management_module.sql
-- Dependencies: 
--   - V1__create_organizations_module.sql
--   - V2__create_users_module.sql
-- =====================================================

-- =====================================================
-- TABLE: employees
-- =====================================================
-- Description: Core employee information for payroll processing
-- Relationships: 
--   - Belongs to organization (organization_id FK)
--   - Created by user (created_by_user_id FK)
--   - Has many salary history records
-- =====================================================

CREATE TABLE employees (
    -- Primary Key
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Foreign Keys
    organization_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_by_user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Employee Identification
    employee_id             VARCHAR(20) NOT NULL,  -- Custom employee code (e.g., EMP001)
    name                    VARCHAR(100) NOT NULL,
    phone_number            VARCHAR(15),  -- Optional: Format +91XXXXXXXXXX
    
    -- Employment Details
    date_of_joining         DATE NOT NULL,
    status                  VARCHAR(20) NOT NULL DEFAULT 'active',
    
    -- Termination Details (NULL when active)
    termination_date        DATE,
    termination_reason      TEXT,
    
    -- Salary Information
    salary_type             VARCHAR(20) NOT NULL,  -- monthly, daily, hourly
    salary                  DECIMAL(10, 2) NOT NULL,  -- Current salary amount
    payment_schedule        VARCHAR(20) NOT NULL,  -- monthly, weekly, biweekly
    
    -- Audit Trail
    created_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT employees_org_empid_unique UNIQUE (organization_id, employee_id),
    CONSTRAINT employees_status_check 
        CHECK (status IN ('active', 'on_leave', 'suspended', 'terminated')),
    CONSTRAINT employees_salary_type_check 
        CHECK (salary_type IN ('monthly', 'daily', 'hourly')),
    CONSTRAINT employees_payment_schedule_check 
        CHECK (payment_schedule IN ('monthly', 'weekly', 'biweekly')),
    CONSTRAINT employees_salary_positive 
        CHECK (salary >= 0 AND salary <= 10000000),
    CONSTRAINT employees_termination_logic 
        CHECK (
            (status = 'terminated' AND termination_date IS NOT NULL) OR
            (status != 'terminated' AND termination_date IS NULL)
        ),
    CONSTRAINT employees_phone_format 
        CHECK (phone_number IS NULL OR phone_number ~ '^\+91[6-9]\d{9}$')
);

-- =====================================================
-- TABLE: employee_salary_history
-- =====================================================
-- Description: Track all salary changes for audit and compliance
-- Relationships: 
--   - Belongs to employee (employee_id FK)
--   - Changed by user (changed_by_user_id FK)
-- =====================================================

CREATE TABLE employee_salary_history (
    -- Primary Key
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Foreign Keys
    employee_id             UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    changed_by_user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Salary Change Details
    previous_salary         DECIMAL(10, 2) NOT NULL,
    new_salary              DECIMAL(10, 2) NOT NULL,
    previous_salary_type    VARCHAR(20) NOT NULL,
    new_salary_type         VARCHAR(20) NOT NULL,
    
    -- Change Metadata
    change_date             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reason                  TEXT,  -- Optional: increment, promotion, correction, etc.
    
    -- Audit Trail
    created_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT salary_history_salary_type_check 
        CHECK (
            previous_salary_type IN ('monthly', 'daily', 'hourly') AND
            new_salary_type IN ('monthly', 'daily', 'hourly')
        ),
    CONSTRAINT salary_history_salary_positive 
        CHECK (previous_salary >= 0 AND new_salary >= 0)
);

-- =====================================================
-- INDEXES FOR PERFORMANCE OPTIMIZATION
-- =====================================================

-- Employees table indexes

-- Most common query: list employees by organization and status
CREATE INDEX idx_employees_org_status ON employees(organization_id, status);

-- Unique lookup by organization and employee_id
CREATE INDEX idx_employees_org_empid ON employees(organization_id, employee_id);

-- Search by phone number
CREATE INDEX idx_employees_phone ON employees(phone_number) WHERE phone_number IS NOT NULL;

-- Filter by date of joining (for reports and filtering)
CREATE INDEX idx_employees_date_of_joining ON employees(date_of_joining);

-- Filter by salary (for salary-based queries)
CREATE INDEX idx_employees_salary ON employees(salary);

-- Filter by salary type (common in payroll processing)
CREATE INDEX idx_employees_salary_type ON employees(organization_id, salary_type);

-- Audit trail: created by user
CREATE INDEX idx_employees_created_by ON employees(created_by_user_id);

-- Composite index for active employees by organization (most frequent query)
CREATE INDEX idx_employees_org_active ON employees(organization_id, status) 
    WHERE status = 'active';

-- Terminated employees with termination date
CREATE INDEX idx_employees_terminated ON employees(organization_id, termination_date) 
    WHERE status = 'terminated';

-- Salary history indexes

-- Get salary history for an employee
CREATE INDEX idx_salary_history_employee ON employee_salary_history(employee_id, change_date DESC);

-- Audit trail: who changed salaries
CREATE INDEX idx_salary_history_changed_by ON employee_salary_history(changed_by_user_id);

-- =====================================================
-- TRIGGERS FOR AUTOMATIC TIMESTAMP UPDATES
-- =====================================================

-- Trigger for employees table (reuses function from organizations module)
CREATE TRIGGER update_employees_updated_at 
    BEFORE UPDATE ON employees 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- ROW-LEVEL SECURITY (RLS)
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_salary_history ENABLE ROW LEVEL SECURITY;

-- Policy: Users can see employees from their organizations
CREATE POLICY employees_org_member_access ON employees
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

-- Policy: Users can see salary history for employees in their organizations
CREATE POLICY salary_history_org_member_access ON employee_salary_history
    FOR ALL
    USING (
        employee_id IN (
            SELECT e.id 
            FROM employees e
            JOIN organization_users ou ON e.organization_id = ou.organization_id
            WHERE ou.user_id = current_setting('app.current_user_id', true)::uuid
            AND ou.is_active = true
        )
        OR current_setting('app.bypass_rls', true) = 'true'
    );

-- =====================================================
-- COMMENTS (Schema Documentation)
-- =====================================================

COMMENT ON TABLE employees IS 
    'Stores employee information for payroll processing. Each employee belongs to one organization and has salary tracking with complete history.';

COMMENT ON COLUMN employees.id IS 
    'Unique identifier for the employee (UUID). Used as foreign key in attendance, leaves, payroll, payments, advances, and loans modules.';

COMMENT ON COLUMN employees.employee_id IS 
    'Custom employee code/ID (e.g., EMP001, EMP002). Unique within organization. Auto-generated if not provided during creation.';

COMMENT ON COLUMN employees.name IS 
    'Employee full name. Required field, 2-100 characters.';

COMMENT ON COLUMN employees.phone_number IS 
    'Optional employee mobile number. Format: +91XXXXXXXXXX (Indian mobile). Used for contact, NOT for authentication.';

COMMENT ON COLUMN employees.date_of_joining IS 
    'Date when employee joined the organization. Used for tenure calculations and probation tracking.';

COMMENT ON COLUMN employees.status IS 
    'Employment status: active (working), on_leave (temporary leave), suspended (disciplinary), terminated (left organization).';

COMMENT ON COLUMN employees.termination_date IS 
    'Date when employee left the organization. NULL when active. Required when status = terminated.';

COMMENT ON COLUMN employees.termination_reason IS 
    'Reason for termination: resigned, terminated, retired, etc. Recommended when status = terminated.';

COMMENT ON COLUMN employees.salary_type IS 
    'Salary structure type: monthly (fixed monthly), daily (per day rate), hourly (per hour rate).';

COMMENT ON COLUMN employees.salary IS 
    'Current salary amount. Meaning depends on salary_type: monthly = per month, daily = per day, hourly = per hour.';

COMMENT ON COLUMN employees.payment_schedule IS 
    'Frequency of salary payment: monthly (once per month), weekly (every week), biweekly (every 2 weeks).';

COMMENT ON COLUMN employees.created_by_user_id IS 
    'User who created this employee record. Links to users table. Used for audit trail.';

COMMENT ON TABLE employee_salary_history IS 
    'Immutable audit log of all salary changes. Created automatically when employee salary is updated via PATCH API.';

COMMENT ON COLUMN employee_salary_history.previous_salary IS 
    'Salary amount before the change. Preserved for audit and compliance.';

COMMENT ON COLUMN employee_salary_history.new_salary IS 
    'Salary amount after the change. Matches current employee.salary at time of change.';

COMMENT ON COLUMN employee_salary_history.change_date IS 
    'Timestamp when salary was changed. Defaults to current timestamp.';

COMMENT ON COLUMN employee_salary_history.changed_by_user_id IS 
    'User who performed the salary change. Links to users table for audit trail.';

COMMENT ON COLUMN employee_salary_history.reason IS 
    'Optional reason for salary change: annual increment, promotion, correction, market adjustment, etc.';

-- =====================================================
-- END OF MIGRATION
-- =====================================================    