-- Enable Row Level Security on organizations and organization_settings tables
  
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
     