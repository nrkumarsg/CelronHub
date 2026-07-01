-- ==========================================
-- SQL SEED & RLS REPAIR FOR MULTI-COMPANY ACCESS
-- ==========================================
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard)
-- to allow proper tenancy switching and fix the logo url mismatch.

-- 1. Seed target companies in 'companies' table if they are missing
INSERT INTO public.companies (id, name, slug, logo_url)
VALUES 
    ('8431cd0b-7449-44a5-8213-2a8680d09ebe', 'CEL-RON ENTERPRISES PTE LTD', 'celron-enterprises', 'https://sgspmepkggjphwqqlyrs.supabase.co/storage/v1/object/public/logos/CEL-RON%20Hub%20circular%20logo.png'),
    ('c0000000-0000-0000-0000-000000000002', 'ARK INTERNATIONAL SERVICES', 'ark-international', NULL),
    ('c0000000-0000-0000-0000-000000000003', 'arkis pte ltd', 'arkis-pte', NULL)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    slug = EXCLUDED.slug,
    logo_url = COALESCE(companies.logo_url, EXCLUDED.logo_url);

-- 2. Create profile and link to companies dynamically using the actual auth.users UUID
DO $$
DECLARE
    uid UUID;
BEGIN
    -- Query the actual auth.users UUID for nrkumarsg@gmail.com
    SELECT id INTO uid FROM auth.users WHERE email = 'nrkumarsg@gmail.com' LIMIT 1;

    IF uid IS NOT NULL THEN
        -- Create/update profile
        INSERT INTO public.profiles (id, email, role, status, company_id, accessible_modules)
        VALUES (
            uid,
            'nrkumarsg@gmail.com',
            'superadmin',
            'active',
            '8431cd0b-7449-44a5-8213-2a8680d09ebe',
            '{"partners", "contacts", "vessels", "work-locations", "catalog", "reports", "settings", "workflows", "universal-finder", "storage-directory"}'::text[]
        )
        ON CONFLICT (id) DO UPDATE SET role = 'superadmin';

        -- Link user to the companies
        INSERT INTO public.company_users (company_id, user_id, role)
        VALUES 
            ('8431cd0b-7449-44a5-8213-2a8680d09ebe', uid, 'admin'),
            ('c0000000-0000-0000-0000-000000000002', uid, 'admin'),
            ('c0000000-0000-0000-0000-000000000003', uid, 'admin')
        ON CONFLICT (company_id, user_id) DO NOTHING;
        
        RAISE NOTICE 'Successfully seeded profile and links for user ID: %', uid;
    ELSE
        RAISE WARNING 'User nrkumarsg@gmail.com was not found in auth.users. Please make sure you signed up first.';
    END IF;
END $$;

-- 4. Sync document_settings logo for CEL-RON to be the circular logo
UPDATE public.document_settings
SET logo_url = 'https://sgspmepkggjphwqqlyrs.supabase.co/storage/v1/object/public/logos/CEL-RON%20Hub%20circular%20logo.png'
WHERE company_id = '8431cd0b-7449-44a5-8213-2a8680d09ebe';

-- 5. Set RLS Policies to allow reading companies list for all authenticated users
DROP POLICY IF EXISTS "Users can view companies they belong to" ON public.companies;
CREATE POLICY "Users can view companies they belong to" ON public.companies
FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "Users can view their own company memberships" ON public.company_users;
CREATE POLICY "Users can view their own company memberships" ON public.company_users
FOR SELECT TO authenticated
USING (true);
