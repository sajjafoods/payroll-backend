-- =====================================================
-- USERS MODULE - DATABASE SCHEMA
-- =====================================================
-- Project: AI-First Payroll Management System
-- Database: PostgreSQL 15 (Supabase)
-- Migration: V2__create_users_module.sql
-- Dependencies: V1__create_organizations_module.sql
-- =====================================================

-- =====================================================
-- TABLE: users
-- =====================================================
-- Description: Core user profiles with phone-based authentication
-- Relationships: Many-to-Many with organizations via organization_users
-- =====================================================

CREATE TABLE users (
    -- Primary Key
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Authentication (Phone-based OTP)
    phone_number            VARCHAR(20) NOT NULL UNIQUE,
    phone_verified          BOOLEAN NOT NULL DEFAULT false,
    phone_verified_at       TIMESTAMP WITH TIME ZONE,
    
    -- Profile Information
    name                    VARCHAR(100) NOT NULL,
    email                   VARCHAR(255),
    avatar_url              TEXT,
    
    -- Account Status
    is_active               BOOLEAN NOT NULL DEFAULT true,
    is_locked               BOOLEAN NOT NULL DEFAULT false,
    locked_until            TIMESTAMP WITH TIME ZONE,
    locked_reason           VARCHAR(255),
    
    -- Security Tracking
    last_login_at           TIMESTAMP WITH TIME ZONE,
    last_login_ip           INET,
    failed_login_attempts   INT NOT NULL DEFAULT 0,
    last_failed_login_at    TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    created_at              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT users_phone_format_check 
        CHECK (phone_number ~ '^\+[1-9]\d{1,14}$'),
    CONSTRAINT users_email_format_check 
        CHECK (email IS NULL OR email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT users_name_length_check 
        CHECK (char_length(name) >= 2 AND char_length(name) <= 100),
    CONSTRAINT users_locked_until_check
        CHECK (locked_until IS NULL OR (is_locked = true AND locked_until > CURRENT_TIMESTAMP))
);

COMMENT ON TABLE users IS 
    'Core user profiles with phone-based OTP authentication. One user account per phone number. Users can belong to multiple organizations via organization_users join table.';

COMMENT ON COLUMN users.phone_number IS 
    'Unique phone number with country code (E.164 format). Primary authentication identifier. Example: +919876543210';

COMMENT ON COLUMN users.phone_verified IS 
    'Whether phone number has been verified via OTP. Set to true after first successful OTP verification.';

COMMENT ON COLUMN users.name IS 
    'User full name. Initially set during signup via /auth/complete-profile endpoint.';

COMMENT ON COLUMN users.is_locked IS 
    'Account lock status. True if locked due to security reasons (too many failed login attempts). Auto-unlocks after locked_until timestamp.';

COMMENT ON COLUMN users.locked_until IS 
    'Timestamp when account lock expires. Null if not locked. After 5 failed OTP verifications, locked for 30 minutes.';

COMMENT ON COLUMN users.failed_login_attempts IS 
    'Counter for consecutive failed OTP verification attempts. Resets to 0 on successful login. Triggers account lock at 5 attempts.';

-- =====================================================
-- TABLE: organization_users (Join Table)
-- =====================================================
-- Description: Many-to-Many relationship between users and organizations
--              Stores role and granular permissions per user per organization
-- =====================================================

CREATE TABLE organization_users (
    -- Composite Primary Key
    organization_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Role & Permissions
    role                    VARCHAR(20) NOT NULL,
    permissions             JSONB NOT NULL,
    
    -- Invitation & Status
    invited_by_user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
    invited_at              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    joined_at               TIMESTAMP WITH TIME ZONE,
    is_active               BOOLEAN NOT NULL DEFAULT true,
    
    -- Metadata
    created_at              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Primary Key
    PRIMARY KEY (organization_id, user_id),
    
    -- Constraints
    CONSTRAINT org_users_role_check 
        CHECK (role IN ('owner', 'hr_manager', 'accountant')),
    CONSTRAINT org_users_permissions_structure_check
        CHECK (
            jsonb_typeof(permissions) = 'object' AND
            permissions ? 'employees' AND
            permissions ? 'attendance' AND
            permissions ? 'leaves' AND
            permissions ? 'payroll' AND
            permissions ? 'payments' AND
            permissions ? 'advances' AND
            permissions ? 'loans' AND
            permissions ? 'reports'
        )
);

COMMENT ON TABLE organization_users IS 
    'Many-to-Many join table linking users to organizations with role and permissions. Supports all relationship patterns: single owner, multi-business owner, team collaboration, freelance professional.';

COMMENT ON COLUMN organization_users.role IS 
    'User role within the organization: owner (full access), hr_manager (people-focused), accountant (finance-focused). Determines default permissions.';

COMMENT ON COLUMN organization_users.permissions IS 
    'JSONB object with module-level and feature-level permissions. Structure: {"module": ["action1", "action2"]}. 8 modules: employees, attendance, leaves, payroll, payments, advances, loans, reports. Actions: create, read, update, delete, export.';

COMMENT ON COLUMN organization_users.invited_by_user_id IS 
    'User ID who invited this user to the organization. Null for organization creator (owner). Used for audit trail.';

COMMENT ON COLUMN organization_users.joined_at IS 
    'Timestamp when user accepted invitation and joined organization. Null if invitation pending.';

-- =====================================================
-- TABLE: user_sessions
-- =====================================================
-- Description: Session management with device tracking
--              Source of truth synced with Redis for performance
-- =====================================================

CREATE TABLE user_sessions (
    -- Primary Key
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- User Reference
    user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Token (Hashed)
    refresh_token_hash      VARCHAR(255) NOT NULL UNIQUE,
    
    -- Device Information
    device_id               VARCHAR(255),
    device_name             VARCHAR(255),
    platform                VARCHAR(20),  -- web, android, ios
    
    -- Security Tracking
    ip_address              INET,
    user_agent              TEXT,
    
    -- Session Status
    is_active               BOOLEAN NOT NULL DEFAULT true,
    last_activity_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Expiration
    expires_at              TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Revocation
    revoked_at              TIMESTAMP WITH TIME ZONE,
    revoked_reason          VARCHAR(100),  -- logout, security, token_rotation, admin_revoke
    
    -- Metadata
    created_at              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT sessions_platform_check 
        CHECK (platform IN ('web', 'android', 'ios')),
    CONSTRAINT sessions_expiry_check 
        CHECK (expires_at > created_at),
    CONSTRAINT sessions_revoked_check
        CHECK (revoked_at IS NULL OR (is_active = false AND revoked_reason IS NOT NULL))
);

COMMENT ON TABLE user_sessions IS 
    'Active user sessions with device tracking. Source of truth synced with Redis for performance. Supports multiple devices per user (max 5 concurrent sessions).';

COMMENT ON COLUMN user_sessions.refresh_token_hash IS 
    'Bcrypt hash of refresh token. Never store plain refresh tokens. Used to validate refresh requests.';

COMMENT ON COLUMN user_sessions.device_id IS 
    'Unique device identifier for tracking logins across devices. Used in "Active devices" feature.';

COMMENT ON COLUMN user_sessions.platform IS 
    'Device platform: web, android, ios. Used for device-specific features and notifications.';

COMMENT ON COLUMN user_sessions.revoked_reason IS 
    'Reason for session revocation: logout (user initiated), security (suspicious activity), token_rotation (new refresh token issued), admin_revoke (admin action), session_limit_exceeded (max 5 sessions).';

-- =====================================================
-- TABLE: otp_sessions
-- =====================================================
-- Description: Temporary OTP storage for phone authentication
--              Auto-expires after 5 minutes, max 5 attempts
-- =====================================================

CREATE TABLE otp_sessions (
    -- Primary Key
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Phone Number (not FK - user may not exist yet)
    phone_number            VARCHAR(20) NOT NULL,
    
    -- OTP (Hashed)
    otp_hash                VARCHAR(255) NOT NULL,
    
    -- Attempt Tracking
    attempts                INT NOT NULL DEFAULT 0,
    max_attempts            INT NOT NULL DEFAULT 5,
    
    -- Verification Status
    is_verified             BOOLEAN NOT NULL DEFAULT false,
    verified_at             TIMESTAMP WITH TIME ZONE,
    
    -- Security
    ip_address              INET,
    
    -- Expiration (5 minutes)
    created_at              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP + INTERVAL '5 minutes',
    
    -- Constraints
    CONSTRAINT otp_phone_format_check 
        CHECK (phone_number ~ '^\+[1-9]\d{1,14}$'),
    CONSTRAINT otp_expiry_check 
        CHECK (expires_at > created_at),
    CONSTRAINT otp_attempts_check
        CHECK (attempts >= 0 AND attempts <= max_attempts),
    CONSTRAINT otp_verified_check
        CHECK (verified_at IS NULL OR (is_verified = true AND verified_at <= CURRENT_TIMESTAMP))
);

COMMENT ON TABLE otp_sessions IS 
    'Temporary OTP storage for phone authentication. Auto-expires after 5 minutes. Max 5 verification attempts before new OTP required.';

COMMENT ON COLUMN otp_sessions.otp_hash IS 
    'Bcrypt hash of 6-digit OTP. Never store plain OTPs. Generated randomly and sent via SMS.';

COMMENT ON COLUMN otp_sessions.attempts IS 
    'Number of verification attempts for this OTP. Increments on each failed verify-otp call. Max 5 attempts.';

COMMENT ON COLUMN otp_sessions.is_verified IS 
    'Whether OTP has been successfully verified. Used to prevent OTP reuse. One-time use only.';

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Users Table Indexes
CREATE INDEX idx_users_phone ON users(phone_number);
CREATE INDEX idx_users_email ON users(email) WHERE email IS NOT NULL;
CREATE INDEX idx_users_is_active ON users(is_active) WHERE is_active = true;
CREATE INDEX idx_users_created_at ON users(created_at DESC);

-- Organization Users Indexes
CREATE INDEX idx_org_users_user_id ON organization_users(user_id);
CREATE INDEX idx_org_users_org_id_active ON organization_users(organization_id, is_active) 
    WHERE is_active = true;
CREATE INDEX idx_org_users_role ON organization_users(role);
CREATE INDEX idx_org_users_permissions ON organization_users USING GIN(permissions);

-- User Sessions Indexes
CREATE INDEX idx_sessions_user_active ON user_sessions(user_id, is_active) 
    WHERE is_active = true;
CREATE INDEX idx_sessions_refresh_token ON user_sessions(refresh_token_hash) 
    WHERE is_active = true;
CREATE INDEX idx_sessions_expires_at ON user_sessions(expires_at) 
    WHERE is_active = true;
CREATE INDEX idx_sessions_device ON user_sessions(user_id, device_id);
CREATE INDEX idx_sessions_last_activity ON user_sessions(last_activity_at DESC);

-- OTP Sessions Indexes
CREATE INDEX idx_otp_phone_active ON otp_sessions(phone_number, is_verified) 
    WHERE is_verified = false;
CREATE INDEX idx_otp_expires_at ON otp_sessions(expires_at);

-- =====================================================
-- TRIGGERS FOR AUTOMATIC TIMESTAMP UPDATES
-- =====================================================

-- Trigger for users table (reuse function from organizations module)
CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for organization_users table
CREATE TRIGGER update_organization_users_updated_at 
    BEFORE UPDATE ON organization_users 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- ROW-LEVEL SECURITY (RLS)
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE otp_sessions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can see their own profile
CREATE POLICY user_self_access ON users
    FOR ALL
    USING (
        id = current_setting('app.current_user_id', true)::uuid
        OR current_setting('app.bypass_rls', true) = 'true'
    );

-- Policy: Users can see organization members of their organizations
CREATE POLICY org_users_member_access ON organization_users
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

-- Policy: Users can see their own sessions
CREATE POLICY sessions_self_access ON user_sessions
    FOR ALL
    USING (
        user_id = current_setting('app.current_user_id', true)::uuid
        OR current_setting('app.bypass_rls', true) = 'true'
    );

-- Policy: OTP sessions are public (no RLS - handled by application logic)
CREATE POLICY otp_sessions_public ON otp_sessions
    FOR ALL
    USING (current_setting('app.bypass_rls', true) = 'true');

-- =====================================================
-- FOREIGN KEY CONSTRAINT (Organizations Module Dependency)
-- =====================================================
-- Now that users table exists, add the FK from organizations

ALTER TABLE organizations 
    ADD CONSTRAINT fk_organizations_created_by_user 
    FOREIGN KEY (created_by_user_id) 
    REFERENCES users(id) 
    ON DELETE SET NULL;

-- Note: Index idx_organizations_created_by already exists from V001__organization.sql

-- =====================================================
-- DEFAULT PERMISSIONS BY ROLE
-- =====================================================

-- Function to get default permissions for a role
CREATE OR REPLACE FUNCTION get_default_permissions(p_role VARCHAR)
RETURNS JSONB AS $$
BEGIN
    RETURN CASE p_role
        WHEN 'owner' THEN 
            '{"employees": ["create", "read", "update", "delete"],
              "attendance": ["create", "read", "update", "delete"],
              "leaves": ["create", "read", "update", "delete"],
              "payroll": ["create", "read", "update", "delete"],
              "payments": ["create", "read", "update", "delete"],
              "advances": ["create", "read", "update", "delete"],
              "loans": ["create", "read", "update", "delete"],
              "reports": ["read", "export"]}'::jsonb
        
        WHEN 'hr_manager' THEN 
            '{"employees": ["create", "read", "update", "delete"],
              "attendance": ["create", "read", "update", "delete"],
              "leaves": ["create", "read", "update", "delete"],
              "payroll": ["read"],
              "payments": ["read"],
              "advances": ["read"],
              "loans": ["read"],
              "reports": ["read", "export"]}'::jsonb
        
        WHEN 'accountant' THEN 
            '{"employees": ["read"],
              "attendance": ["read"],
              "leaves": ["read"],
              "payroll": ["create", "read", "update", "delete"],
              "payments": ["create", "read", "update", "delete"],
              "advances": ["create", "read", "update", "delete"],
              "loans": ["create", "read", "update", "delete"],
              "reports": ["read", "export"]}'::jsonb
        
        ELSE '{}'::jsonb
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function to check if user has permission
CREATE OR REPLACE FUNCTION has_permission(
    p_user_id UUID,
    p_organization_id UUID,
    p_module VARCHAR,
    p_action VARCHAR
)
RETURNS BOOLEAN AS $$
DECLARE
    v_permissions JSONB;
    v_module_permissions JSONB;
BEGIN
    -- Get user's permissions for the organization
    SELECT permissions INTO v_permissions
    FROM organization_users
    WHERE user_id = p_user_id 
    AND organization_id = p_organization_id
    AND is_active = true;
    
    -- User not in organization
    IF v_permissions IS NULL THEN
        RETURN false;
    END IF;
    
    -- Get module-specific permissions
    v_module_permissions := v_permissions -> p_module;
    
    -- Check if action exists in module permissions array
    RETURN v_module_permissions ? p_action;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function to get user's role in organization
CREATE OR REPLACE FUNCTION get_user_role(
    p_user_id UUID,
    p_organization_id UUID
)
RETURNS VARCHAR AS $$
DECLARE
    v_role VARCHAR;
BEGIN
    SELECT role INTO v_role
    FROM organization_users
    WHERE user_id = p_user_id 
    AND organization_id = p_organization_id
    AND is_active = true;
    
    RETURN v_role;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function to count active sessions for user
CREATE OR REPLACE FUNCTION count_active_sessions(p_user_id UUID)
RETURNS INTEGER AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)
        FROM user_sessions
        WHERE user_id = p_user_id
        AND is_active = true
        AND expires_at > CURRENT_TIMESTAMP
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to revoke old sessions if limit exceeded
CREATE OR REPLACE FUNCTION enforce_session_limit()
RETURNS TRIGGER AS $$
DECLARE
    v_max_sessions INT := 5;
    v_active_count INT;
BEGIN
    -- Count active sessions for this user
    v_active_count := count_active_sessions(NEW.user_id);
    
    -- If limit exceeded, revoke oldest sessions
    IF v_active_count >= v_max_sessions THEN
        UPDATE user_sessions
        SET is_active = false,
            revoked_at = CURRENT_TIMESTAMP,
            revoked_reason = 'session_limit_exceeded'
        WHERE id IN (
            SELECT id
            FROM user_sessions
            WHERE user_id = NEW.user_id
            AND is_active = true
            AND expires_at > CURRENT_TIMESTAMP
            ORDER BY last_activity_at ASC
            LIMIT (v_active_count - v_max_sessions + 1)
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_session_limit_trigger
    BEFORE INSERT ON user_sessions
    FOR EACH ROW
    EXECUTE FUNCTION enforce_session_limit();

-- =====================================================
-- CLEANUP FUNCTIONS
-- =====================================================

-- Function to delete expired OTP sessions
CREATE OR REPLACE FUNCTION cleanup_expired_otp_sessions()
RETURNS INTEGER AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    DELETE FROM otp_sessions
    WHERE expires_at < CURRENT_TIMESTAMP - INTERVAL '1 hour';
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to delete expired user sessions
CREATE OR REPLACE FUNCTION cleanup_expired_user_sessions()
RETURNS INTEGER AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    DELETE FROM user_sessions
    WHERE expires_at < CURRENT_TIMESTAMP - INTERVAL '7 days';
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql;
-- =====================================================
-- END OF USERS MODULE SCHEMA MIGRATION
-- =====================================================
