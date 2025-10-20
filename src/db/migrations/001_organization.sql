-- =====================================================
-- TABLE: organizations
-- =====================================================
-- Description: Stores organization/business details for multi-tenant SaaS
-- Relationships: Many-to-Many with users (via organization_users join table)
-- =====================================================

CREATE TABLE organizations (
    -- Primary Key
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Basic Information
    name                    VARCHAR(255) NOT NULL,
    display_name            VARCHAR(255),
    
    -- Contact Information
    phone_number            VARCHAR(20),
    email                   VARCHAR(255),
    address                 TEXT,
    
    -- Setup & Status
    setup_complete          BOOLEAN NOT NULL DEFAULT false,
    status                  VARCHAR(20) NOT NULL DEFAULT 'active',
    
    -- Business Information (Optional - Indian compliance)
    business_type           VARCHAR(100),
    gstin                   VARCHAR(15),      -- GST Identification Number (India)
    pan                     VARCHAR(10),      -- Permanent Account Number (India)
    
    -- Metadata
    created_at              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by_user_id      UUID,             -- Will reference users.id (set after users table created)
    
    -- Constraints
    CONSTRAINT organizations_status_check 
        CHECK (status IN ('active', 'suspended', 'cancelled', 'archived')),
    CONSTRAINT organizations_name_length_check 
        CHECK (char_length(name) >= 2),
    CONSTRAINT organizations_phone_format_check 
        CHECK (phone_number IS NULL OR phone_number ~ '^\+[1-9]\d{1,14}$'),
    CONSTRAINT organizations_email_format_check 
        CHECK (email IS NULL OR email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$'),
    CONSTRAINT organizations_gstin_format_check 
        CHECK (gstin IS NULL OR gstin ~ '^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}$'),
    CONSTRAINT organizations_pan_format_check 
        CHECK (pan IS NULL OR pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]{1}$')
);

-- =====================================================
-- INDEXES FOR organizations
-- =====================================================

-- Status index (most queries filter by active status)
CREATE INDEX idx_organizations_status 
    ON organizations(status) 
    WHERE status = 'active';

-- Created by index (for audit queries)
CREATE INDEX idx_organizations_created_by 
    ON organizations(created_by_user_id)
    WHERE created_by_user_id IS NOT NULL;

-- Phone number index (for lookups during signup)
CREATE INDEX idx_organizations_phone 
    ON organizations(phone_number)
    WHERE phone_number IS NOT NULL;

-- Email index (for lookups)
CREATE INDEX idx_organizations_email 
    ON organizations(email)
    WHERE email IS NOT NULL;

-- Full text search index for organization names
CREATE INDEX idx_organizations_name_search 
    ON organizations 
    USING gin(to_tsvector('english', name));

-- Composite index for common dashboard queries
CREATE INDEX idx_organizations_status_created 
    ON organizations(status, created_at DESC);

-- =====================================================
-- TABLE: organization_settings
-- =====================================================
-- Description: Organization-specific configuration and defaults
-- Relationship: One-to-One with organizations
-- =====================================================

CREATE TABLE organization_settings (
    organization_id         UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- Payroll Settings
    default_payment_schedule VARCHAR(20) DEFAULT 'monthly',
    default_working_days    INTEGER DEFAULT 26,
    week_start_day          VARCHAR(10) DEFAULT 'monday',
    
    -- Leave Settings
    default_annual_leaves   DECIMAL(5,1) DEFAULT 12.0,
    leave_accrual_enabled   BOOLEAN DEFAULT false,
    
    -- Advance & Loan Settings
    max_advance_percent     INTEGER DEFAULT 75,
    max_loan_percent        INTEGER DEFAULT 75,
    
    -- Notification Settings
    sms_notifications       BOOLEAN DEFAULT true,
    email_notifications     BOOLEAN DEFAULT false,
    
    -- Regional Settings
    timezone                VARCHAR(50) DEFAULT 'Asia/Kolkata',
    currency                VARCHAR(3) DEFAULT 'INR',
    date_format             VARCHAR(20) DEFAULT 'DD/MM/YYYY',
    
    -- Metadata
    created_at              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT org_settings_payment_schedule_check 
        CHECK (default_payment_schedule IN ('daily', 'weekly', 'biweekly', 'monthly')),
    CONSTRAINT org_settings_working_days_check 
        CHECK (default_working_days BETWEEN 20 AND 31),
    CONSTRAINT org_settings_max_percent_check 
        CHECK (max_advance_percent BETWEEN 0 AND 100 AND max_loan_percent BETWEEN 0 AND 100),
    CONSTRAINT org_settings_week_start_check
        CHECK (week_start_day IN ('monday', 'sunday', 'saturday'))
);

-- =====================================================
-- TRIGGERS FOR AUTOMATIC TIMESTAMP UPDATES
-- =====================================================

-- Trigger function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for organizations table
CREATE TRIGGER update_organizations_updated_at 
    BEFORE UPDATE ON organizations 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for organization_settings table
CREATE TRIGGER update_organization_settings_updated_at 
    BEFORE UPDATE ON organization_settings 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- ROW-LEVEL SECURITY (RLS)
-- =====================================================
-- Defense-in-depth: Ensures users can only access organizations they belong to
-- Note: Primarily useful if using Supabase PostgREST or for extra security layer
-- For Spring Boot + JPA: Application-level filtering is primary mechanism
-- =====================================================

-- Enable RLS on organizations table
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- Enable RLS on organization_settings table
ALTER TABLE organization_settings ENABLE ROW LEVEL SECURITY;

-- Policy: Allow users to see organizations they are members of
-- Note: This policy references organization_users table (will be created in Users module)
-- Policy will be activated after organization_users table is created
CREATE POLICY org_member_access ON organizations
    FOR ALL
    USING (
        id IN (
            SELECT organization_id 
            FROM organization_users 
            WHERE user_id = current_setting('app.current_user_id', true)::uuid
        )
        OR 
        current_setting('app.bypass_rls', true) = 'true'  -- Allow service account access
    );

-- Policy: Users can see settings for organizations they belong to
CREATE POLICY org_settings_member_access ON organization_settings
    FOR ALL
    USING (
        organization_id IN (
            SELECT organization_id 
            FROM organization_users 
            WHERE user_id = current_setting('app.current_user_id', true)::uuid
        )
        OR 
        current_setting('app.bypass_rls', true) = 'true'  -- Allow service account access
    );

-- =====================================================
-- COMMENTS (Schema Documentation)
-- =====================================================

COMMENT ON TABLE organizations IS 
    'Stores organization/business details for multi-tenant SaaS. Each organization represents a single business using the payroll system. Has Many-to-Many relationship with users via organization_users join table.';

COMMENT ON COLUMN organizations.id IS 
    'Unique identifier for the organization (UUID for security and partition-friendly). Used as foreign key in all other tables for multi-tenancy.';

COMMENT ON COLUMN organizations.name IS 
    'Organization name - initially set to phone number during signup, updated during profile completion via /auth/complete-profile endpoint';

COMMENT ON COLUMN organizations.display_name IS 
    'Optional display name for branding purposes (e.g., "Raj Electronics Pvt Ltd" while name is "Raj Electronics")';

COMMENT ON COLUMN organizations.setup_complete IS 
    'Whether onboarding wizard completed (owner name and organization name filled via /auth/complete-profile). False = profile pending, True = ready to use';

COMMENT ON COLUMN organizations.status IS 
    'Organization lifecycle status: active (operational), suspended (policy violation), cancelled (voluntary termination), archived (long inactive)';

COMMENT ON COLUMN organizations.gstin IS 
    'GST Identification Number (India) - Format: 22AAAAA0000A1Z5. Required for businesses with turnover > 40 lakhs. Validated by regex constraint.';

COMMENT ON COLUMN organizations.pan IS 
    'Permanent Account Number (India) - Format: AAAAA0000A. Used for tax purposes. Validated by regex constraint.';

COMMENT ON COLUMN organizations.created_by_user_id IS 
    'User who created this organization (the owner). References users.id (foreign key added after users table creation)';

COMMENT ON TABLE organization_settings IS 
    'Organization-specific configuration and defaults for payroll, leaves, advances, and regional preferences. One-to-One relationship with organizations.';

COMMENT ON COLUMN organization_settings.default_payment_schedule IS 
    'Default payment schedule for new employees: daily, weekly, biweekly, monthly. Can be overridden per employee.';

COMMENT ON COLUMN organization_settings.default_working_days IS 
    'Default number of working days per month for salary calculations (typically 26-30). Used for daily rate calculation: monthly_salary / working_days';

COMMENT ON COLUMN organization_settings.default_annual_leaves IS 
    'Default annual leave allocation for new employees (in days). Indian standard is typically 12-18 days per year.';

COMMENT ON COLUMN organization_settings.max_advance_percent IS 
    'Maximum salary advance as percentage of monthly/daily salary (default: 75%). System enforces this limit when recording advances.';

COMMENT ON COLUMN organization_settings.max_loan_percent IS 
    'Maximum loan amount as percentage of monthly salary (default: 75%). System enforces this limit when approving loans.';