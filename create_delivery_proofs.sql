-- =========================================================================
-- CREATE DELIVERY PROOFS TABLE
-- =========================================================================
-- This script creates the missing 'delivery_proofs' table in the database,
-- which stores recipient signatures, photos, coordinates, and sync data.
--
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard)
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.delivery_proofs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES public.workflow_documents(id) ON DELETE CASCADE,
    job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
    recipient_name TEXT NOT NULL,
    signature_drive_id TEXT,
    photo_drive_ids TEXT[] DEFAULT '{}',
    gps_latitude NUMERIC,
    gps_longitude NUMERIC,
    location_name TEXT,
    delivered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.delivery_proofs ENABLE ROW LEVEL SECURITY;

-- Permissive policy for authenticated users (Web App dashboard users)
DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.delivery_proofs;
CREATE POLICY "Enable all for authenticated users" ON public.delivery_proofs 
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Permissive policy for anonymous public access (Mobile App sync clients)
DROP POLICY IF EXISTS "Enable all for anonymous access" ON public.delivery_proofs;
CREATE POLICY "Enable all for anonymous access" ON public.delivery_proofs 
    FOR ALL TO public USING (true) WITH CHECK (true);
