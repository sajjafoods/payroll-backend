-- =====================================================
-- ADVANCES, LOANS & PAYMENT RECORDING - DATABASE SCHEMA
-- =====================================================
-- Project: AI-First Payroll Management System
-- Database: PostgreSQL 15 (Supabase)
-- Migration: V5__create_advances_loans_payments_module.sql
-- Dependencies: V1 (Organizations), V2 (Users), V3 (Employees), V4 (Attendance)
-- =====================================================

-- =====================================================
-- TABLE OF CONTENTS
-- =====================================================
-- 1. employee_advances (unified advances and loans)
-- 2. loan_installment_history (loan payment tracking)
-- 3. payments (payment records with calculation snapshots)
-- 4. payment_advance_clearances (junction table)
-- 5. payment_loan_installments (junction table)
-- 6. Indexes for Performance
-- 7. Triggers for Automatic Updates
-- 8. Row-Level Security (RLS)
-- 9. Comments (Schema Documentation)
-- 10. Sample Data
-- 11. Sample Queries & API Mappings
-- 12. Rollback Strategy
-- 13. Flyway Migration Notes
-- =====================================================

-- =====================================================
-- TABLE: employee_advances
-- =====================================================
-- Description: Unified table for both salary advances and employee loans
-- API: POST /api/v1/organizations/:orgId/advances (CREATE)
--      GET /api/v1/organizations/:orgId/employees/:employeeId/advances (READ)
--      DELETE /api/v1/organizations/:orgId/advances/:advanceId (DELETE)
-- Relationships: Many-to-One with employees, organizations, users
-- =====================================================

CREATE TABLE employee_advances (
    -- Primary Key
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Foreign Keys
    organization_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    employee_id             UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    
    -- Advance/Loan Details
    amount                  DECIMAL(10,2) NOT NULL CHECK (amount > 0 AND amount <= 1000000),
    advance_date            DATE NOT NULL,
    advance_type            VARCHAR(20) NOT NULL CHECK (advance_type IN ('advance', 'loan')),
    
    -- Loan-Specific Fields (NULL for advances)
    installments            INTEGER CHECK (installments BETWEEN 1 AND 60),
    monthly_installment     DECIMAL(10,2) CHECK (monthly_installment > 0),
    interest_rate           DECIMAL(5,2) CHECK (interest_rate BETWEEN 0 AND 36),
    loan_start_date         DATE,
    
    -- Status Tracking
    status                  VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (
        status IN ('pending', 'active', 'cleared', 'completed', 'cancelled', 'unrecoverable')
    ),
    
    -- Loan Repayment Tracking (NULL for advances)
    paid_installments       INTEGER DEFAULT 0 CHECK (paid_installments >= 0),
    remaining_balance       DECIMAL(10,2) CHECK (remaining_balance >= 0),
    
    -- Clearance Info (for advances)
    cleared_at              TIMESTAMP WITH TIME ZONE,
    cleared_by_payment_id   UUID,  -- FK added later after payments table created
    
    -- Additional Information
    reason                  VARCHAR(500),
    notes                   TEXT,
    
    -- Soft Delete
    deleted_at              TIMESTAMP WITH TIME ZONE,
    deleted_by_user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Audit Fields
    created_by_user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at              TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT loan_fields_required CHECK (
        (advance_type = 'loan' AND installments IS NOT NULL AND monthly_installment IS NOT NULL 
         AND interest_rate IS NOT NULL AND loan_start_date IS NOT NULL AND remaining_balance IS NOT NULL) OR
        (advance_type = 'advance' AND installments IS NULL AND monthly_installment IS NULL 
         AND interest_rate IS NULL AND loan_start_date IS NULL)
    ),
    CONSTRAINT valid_loan_balance CHECK (
        advance_type = 'advance' OR remaining_balance <= amount
    )
);

-- =====================================================
-- TABLE: loan_installment_history
-- =====================================================
-- Description: Tracks each loan installment payment for audit trail
-- API: Created automatically when POST /api/v1/organizations/:orgId/payments is called
-- Relationships: Many-to-One with employee_advances, payments
-- =====================================================

CREATE TABLE loan_installment_history (
    -- Primary Key
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Foreign Keys
    organization_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    loan_id                 UUID NOT NULL REFERENCES employee_advances(id) ON DELETE CASCADE,
    payment_id              UUID NOT NULL,  -- FK added later after payments table created
    
    -- Installment Details
    installment_number      INTEGER NOT NULL CHECK (installment_number > 0),
    installment_amount      DECIMAL(10,2) NOT NULL CHECK (installment_amount > 0),
    
    -- Balance Tracking
    balance_before          DECIMAL(10,2) NOT NULL,
    balance_after           DECIMAL(10,2) NOT NULL,
    
    -- Payment Details
    paid_date               DATE NOT NULL,
    
    -- Audit Fields
    created_at              TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT valid_balance_change CHECK (balance_before > balance_after),
    CONSTRAINT valid_installment_amount CHECK (balance_before - balance_after = installment_amount)
);

-- =====================================================
-- TABLE: payments
-- =====================================================
-- Description: Records all employee payments with calculation snapshots
-- API: POST /api/v1/organizations/:orgId/payments (CREATE)
--      GET /api/v1/organizations/:orgId/employees/:employeeId/payments (READ)
--      DELETE /api/v1/organizations/:orgId/payments/:paymentId (VOID)
-- Relationships: Many-to-One with employees, organizations, users
-- Note: This is the ONLY place where salary calculations are permanently stored
-- =====================================================

CREATE TABLE payments (
    -- Primary Key
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Foreign Keys
    organization_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    employee_id             UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    
    -- Payment Details
    amount                  DECIMAL(10,2) NOT NULL CHECK (amount > 0),
    payment_date            DATE NOT NULL,
    payment_method          VARCHAR(20) DEFAULT 'cash' CHECK (
        payment_method IN ('cash', 'bank_transfer', 'cheque', 'upi', 'other')
    ),
    
    -- Pay Period (Optional - for salary payments)
    period_start            DATE,
    period_end              DATE,
    
    -- Receipt
    receipt_number          VARCHAR(50) NOT NULL,
    
    -- Calculation Snapshot (JSONB - stores complete salary calculation)
    -- This is the ONLY permanent storage of salary calculations
    -- Structure: {
    --   grossSalary, deductions: {attendance, advances, loans},
    --   netPayable, workingDays, attendanceSummary,
    --   advancesCleared: [ids], loanInstallments: [ids]
    -- }
    calculation_snapshot    JSONB,
    
    -- Additional Information
    notes                   TEXT,
    
    -- Status
    status                  VARCHAR(20) NOT NULL DEFAULT 'completed' CHECK (
        status IN ('completed', 'voided')
    ),
    
    -- Void Information
    voided_at               TIMESTAMP WITH TIME ZONE,
    voided_by_user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
    void_reason             TEXT,
    
    -- Audit Fields
    created_by_user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at              TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT valid_period CHECK (period_end IS NULL OR period_start IS NULL OR period_end >= period_start),
    CONSTRAINT unique_receipt_per_org UNIQUE (organization_id, receipt_number),
    CONSTRAINT void_info_required CHECK (
        (status = 'voided' AND voided_at IS NOT NULL AND void_reason IS NOT NULL) OR
        (status = 'completed' AND voided_at IS NULL AND void_reason IS NULL)
    )
);

-- =====================================================
-- TABLE: payment_advance_clearances
-- =====================================================
-- Description: Junction table tracking which advances were cleared by which payment
-- API: Created automatically when POST /api/v1/organizations/:orgId/payments is called
-- Relationships: Many-to-Many between payments and employee_advances
-- =====================================================

CREATE TABLE payment_advance_clearances (
    -- Composite Primary Key
    payment_id              UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    advance_id              UUID NOT NULL REFERENCES employee_advances(id) ON DELETE CASCADE,
    
    -- Clearance Details
    amount_cleared          DECIMAL(10,2) NOT NULL CHECK (amount_cleared > 0),
    cleared_at              TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    PRIMARY KEY (payment_id, advance_id)
);

-- =====================================================
-- TABLE: payment_loan_installments
-- =====================================================
-- Description: Junction table tracking which loan installments were paid by which payment
-- API: Created automatically when POST /api/v1/organizations/:orgId/payments is called
-- Relationships: Many-to-Many between payments and employee_advances (loans)
-- =====================================================

CREATE TABLE payment_loan_installments (
    -- Composite Primary Key
    payment_id              UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    loan_id                 UUID NOT NULL REFERENCES employee_advances(id) ON DELETE CASCADE,
    
    -- Installment Details
    installment_number      INTEGER NOT NULL CHECK (installment_number > 0),
    installment_amount      DECIMAL(10,2) NOT NULL CHECK (installment_amount > 0),
    balance_before          DECIMAL(10,2) NOT NULL,
    balance_after           DECIMAL(10,2) NOT NULL,
    
    -- Timestamp
    paid_at                 TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    PRIMARY KEY (payment_id, loan_id)
);

-- =====================================================
-- FOREIGN KEY CONSTRAINTS (Added after table creation)
-- =====================================================

-- Add foreign key from employee_advances to payments
-- (Must be added after payments table exists due to circular dependency)
ALTER TABLE employee_advances 
    ADD CONSTRAINT fk_advances_cleared_by_payment 
    FOREIGN KEY (cleared_by_payment_id) 
    REFERENCES payments(id) 
    ON DELETE SET NULL;

-- Add foreign key from loan_installment_history to payments
-- (Must be added after payments table exists due to circular dependency)
ALTER TABLE loan_installment_history 
    ADD CONSTRAINT fk_loan_installment_payment 
    FOREIGN KEY (payment_id) 
    REFERENCES payments(id) 
    ON DELETE CASCADE;

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Employee Advances Indexes

-- Most common: Get advances/loans for an employee
CREATE INDEX idx_advances_employee ON employee_advances(employee_id, advance_date DESC);

-- Query by organization
CREATE INDEX idx_advances_org ON employee_advances(organization_id, advance_date DESC);

-- Filter by status
CREATE INDEX idx_advances_status ON employee_advances(organization_id, status);

-- Filter by type
CREATE INDEX idx_advances_type ON employee_advances(organization_id, advance_type);

-- Pending advances (for salary calculation)
CREATE INDEX idx_advances_pending ON employee_advances(employee_id, status) 
    WHERE status = 'pending';

-- Active loans (for salary calculation)
CREATE INDEX idx_advances_active_loans ON employee_advances(employee_id, status, advance_type) 
    WHERE status = 'active' AND advance_type = 'loan';

-- Cleared by payment (for payment history)
CREATE INDEX idx_advances_cleared_by_payment ON employee_advances(cleared_by_payment_id) 
    WHERE cleared_by_payment_id IS NOT NULL;

-- Audit trail
CREATE INDEX idx_advances_created_by ON employee_advances(created_by_user_id);

-- Loan Installment History Indexes

-- Get installment history for a loan
CREATE INDEX idx_loan_installments_loan ON loan_installment_history(loan_id, installment_number);

-- Get installments paid in a payment
CREATE INDEX idx_loan_installments_payment ON loan_installment_history(payment_id);

-- Query by organization and date
CREATE INDEX idx_loan_installments_org_date ON loan_installment_history(organization_id, paid_date DESC);

-- Payments Indexes

-- Most common: Get payments for an employee
CREATE INDEX idx_payments_employee ON payments(employee_id, payment_date DESC);

-- Query by organization
CREATE INDEX idx_payments_org ON payments(organization_id, payment_date DESC);

-- Filter by status
CREATE INDEX idx_payments_status ON payments(organization_id, status);

-- Filter by payment method
CREATE INDEX idx_payments_method ON payments(organization_id, payment_method);

-- Query by period
CREATE INDEX idx_payments_period ON payments(organization_id, period_start, period_end);

-- Completed payments only (most common)
CREATE INDEX idx_payments_completed ON payments(organization_id, employee_id, payment_date DESC) 
    WHERE status = 'completed';

-- Search by receipt number
CREATE INDEX idx_payments_receipt ON payments(organization_id, receipt_number);

-- Audit trail
CREATE INDEX idx_payments_created_by ON payments(created_by_user_id);

-- Payment Junction Table Indexes

-- Get advances cleared by a payment
CREATE INDEX idx_payment_advances_payment ON payment_advance_clearances(payment_id);

-- Get payments that cleared an advance
CREATE INDEX idx_payment_advances_advance ON payment_advance_clearances(advance_id);

-- Get loan installments in a payment
CREATE INDEX idx_payment_loans_payment ON payment_loan_installments(payment_id);

-- Get payments for a loan
CREATE INDEX idx_payment_loans_loan ON payment_loan_installments(loan_id);

-- =====================================================
-- TRIGGERS FOR AUTOMATIC TIMESTAMP UPDATES
-- =====================================================

-- Trigger for employee_advances (reuses function from organizations module)
CREATE TRIGGER update_employee_advances_updated_at 
    BEFORE UPDATE ON employee_advances 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for payments (reuses function from organizations module)
CREATE TRIGGER update_payments_updated_at 
    BEFORE UPDATE ON payments 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- ROW-LEVEL SECURITY (RLS)
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE employee_advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_installment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_advance_clearances ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_loan_installments ENABLE ROW LEVEL SECURITY;

-- Policy: Users can access advances from their organizations
CREATE POLICY advances_org_member_access ON employee_advances
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

-- Policy: Users can access loan installment history from their organizations
CREATE POLICY loan_installments_org_member_access ON loan_installment_history
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

-- Policy: Users can access payments from their organizations
CREATE POLICY payments_org_member_access ON payments
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

-- Policy: Users can access payment advance clearances for their organization
CREATE POLICY payment_advances_org_member_access ON payment_advance_clearances
    FOR ALL
    USING (
        payment_id IN (
            SELECT id FROM payments 
            WHERE organization_id IN (
                SELECT organization_id 
                FROM organization_users 
                WHERE user_id = current_setting('app.current_user_id', true)::uuid
                AND is_active = true
            )
        )
        OR current_setting('app.bypass_rls', true) = 'true'
    );

-- Policy: Users can access payment loan installments for their organization
CREATE POLICY payment_loans_org_member_access ON payment_loan_installments
    FOR ALL
    USING (
        payment_id IN (
            SELECT id FROM payments 
            WHERE organization_id IN (
                SELECT organization_id 
                FROM organization_users 
                WHERE user_id = current_setting('app.current_user_id', true)::uuid
                AND is_active = true
            )
        )
        OR current_setting('app.bypass_rls', true) = 'true'
    );

-- =====================================================
-- COMMENTS (Schema Documentation)
-- =====================================================

COMMENT ON TABLE employee_advances IS 
    'Unified table for salary advances and employee loans. Advances are one-time deductions, loans have monthly installments.';

COMMENT ON COLUMN employee_advances.advance_type IS 
    'Type of financial assistance: advance (one-time full deduction) or loan (monthly installments).';

COMMENT ON COLUMN employee_advances.status IS 
    'Status: pending (not deducted), active (loan being repaid), cleared (advance fully deducted), completed (loan fully repaid), cancelled (deleted), unrecoverable (employee terminated).';

COMMENT ON COLUMN employee_advances.installments IS 
    'Number of monthly installments (loans only). Min 1, max 60 months.';

COMMENT ON COLUMN employee_advances.remaining_balance IS 
    'Outstanding loan balance (loans only). Reduced with each installment payment.';

COMMENT ON TABLE loan_installment_history IS 
    'Complete audit trail of loan installment payments. Created automatically when payments are recorded.';

COMMENT ON TABLE payments IS 
    'Records all employee payments. This is the ONLY place where salary calculations are permanently stored via calculation_snapshot JSONB field.';

COMMENT ON COLUMN payments.calculation_snapshot IS 
    'JSONB field storing complete salary calculation: gross, deductions (attendance, advances, loans), net payable, working days, attendance summary, advances cleared, loan installments.';

COMMENT ON COLUMN payments.receipt_number IS 
    'Unique receipt number per organization. Auto-generated or custom. Used for financial reconciliation.';

COMMENT ON COLUMN payments.status IS 
    'Payment status: completed (normal), voided (cancelled with reversals).';

COMMENT ON TABLE payment_advance_clearances IS 
    'Junction table tracking which advances were cleared by which payment. Created automatically during payment recording.';

COMMENT ON TABLE payment_loan_installments IS 
    'Junction table tracking which loan installments were paid by which payment. Created automatically during payment recording.';

-- =====================================================
-- SAMPLE DATA
-- =====================================================    
-- (Omitted for brevity - refer to documentation for sample inserts)
