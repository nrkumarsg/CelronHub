-- Permanent Company-Wide Google Drive OAuth Storage
-- Run this once in your Supabase SQL Editor.
-- Stores the offline refresh_token per company so every staff member/device
-- automatically receives a valid Google Drive access token on app load.

CREATE TABLE IF NOT EXISTS public.company_google_integrations (
    company_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
    google_email TEXT,
    google_name TEXT,
    refresh_token TEXT NOT NULL,
    access_token TEXT,
    access_token_expires_at TIMESTAMPTZ,
    scopes TEXT,
    connected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.company_google_integrations ENABLE ROW LEVEL SECURITY;

-- Deny direct browser/anon reads of refresh_token (only server-side service role accesses this table)
DROP POLICY IF EXISTS "No direct client access to google integrations" ON public.company_google_integrations;
CREATE POLICY "No direct client access to google integrations"
    ON public.company_google_integrations
    FOR ALL
    USING (false)
    WITH CHECK (false);

COMMENT ON TABLE public.company_google_integrations IS 'Server-only storage for permanent company-wide Google Drive OAuth refresh tokens.';
