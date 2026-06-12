-- RLS FIX FOR COMPANY_USERS TABLE
-- Run this in your Supabase SQL Editor to allow superadmins to manage user tenancy.

-- 1. DROP old policies on company_users if they exist
DROP POLICY IF EXISTS "Superadmins can insert company memberships" ON public.company_users;
DROP POLICY IF EXISTS "Superadmins can update company memberships" ON public.company_users;
DROP POLICY IF EXISTS "Superadmins can delete company memberships" ON public.company_users;
DROP POLICY IF EXISTS "Enable all access for superadmins" ON public.company_users;

-- 2. CREATE a policy allowing superadmins to perform ALL operations (SELECT, INSERT, UPDATE, DELETE)
CREATE POLICY "Enable all access for superadmins" ON public.company_users
FOR ALL TO authenticated
USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin')
)
WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin')
);
