-- Permanent Company-Wide Google Drive OAuth Storage
-- Run this once in your Supabase SQL Editor.
-- Stores the offline refresh_token per company so every staff member/device
-- automatically receives a valid Google Drive access token on app load.

CREATE TABLE IF NOT EXISTS public.company_google_integrations (
    company_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
    google_email TEXT,
    google_name TEXT,
    refresh_token TEXT NOT NULL,
    client_secret TEXT,
    access_token TEXT,
    access_token_expires_at TIMESTAMPTZ,
    scopes TEXT,
    connected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.company_google_integrations
    ADD COLUMN IF NOT EXISTS client_secret TEXT;

-- Enable Row Level Security
ALTER TABLE public.company_google_integrations ENABLE ROW LEVEL SECURITY;

-- Allow authenticated company users / backend requests with user JWT to read/update their company integration
DROP POLICY IF EXISTS "No direct client access to google integrations" ON public.company_google_integrations;
DROP POLICY IF EXISTS "Authenticated users can manage company google integrations" ON public.company_google_integrations;

CREATE POLICY "Authenticated users can manage company google integrations"
    ON public.company_google_integrations
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

COMMENT ON TABLE public.company_google_integrations IS 'Storage for permanent company-wide Google Drive OAuth refresh tokens.';
