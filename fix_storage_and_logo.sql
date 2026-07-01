-- =======================================================
-- SQL FIX FOR STORAGE UPLOADS & PORTABLE COMPANY LOGOS
-- =======================================================
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard)
-- This creates the missing 'company_assets' storage bucket, configures RLS policies for uploads,
-- and resets the company logos to use the portable local '/logo.png'.

-- 1. Create the 'company_assets' storage bucket if it is missing
INSERT INTO storage.buckets (id, name, public, allowed_mime_types, file_size_limit) 
VALUES (
    'company_assets', 
    'company_assets', 
    true, 
    ARRAY['image/png', 'image/jpeg', 'image/gif', 'image/svg+xml']::text[],
    5242880 -- 5MB limit
)
ON CONFLICT (id) DO NOTHING;

-- 2. Drop any conflicting storage policies for 'company_assets'
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Public Insert" ON storage.objects;
DROP POLICY IF EXISTS "Public Update" ON storage.objects;
DROP POLICY IF EXISTS "Public Delete" ON storage.objects;

-- 3. Create permissive storage policies so logo uploads function correctly
CREATE POLICY "Public Access" ON storage.objects 
    FOR SELECT USING (bucket_id = 'company_assets');

CREATE POLICY "Public Insert" ON storage.objects 
    FOR INSERT WITH CHECK (bucket_id = 'company_assets');

CREATE POLICY "Public Update" ON storage.objects 
    FOR UPDATE WITH CHECK (bucket_id = 'company_assets');

CREATE POLICY "Public Delete" ON storage.objects 
    FOR DELETE USING (bucket_id = 'company_assets');

-- 4. Reset the company logo to the portable, local fallback logo '/logo.png'
-- This resolves the broken image icons by using the built-in circular logo.
UPDATE public.document_settings
SET logo_url = '/logo.png'
WHERE company_id = '8431cd0b-7449-44a5-8213-2a8680d09ebe';

UPDATE public.companies
SET logo_url = '/logo.png'
WHERE id = '8431cd0b-7449-44a5-8213-2a8680d09ebe';
