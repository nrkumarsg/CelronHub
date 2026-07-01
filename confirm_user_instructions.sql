-- ========================================================
-- SQL TO FIX UNCONFIRMED EMAIL & SEED ENQUIRIES
-- ========================================================
-- Run this script in your Supabase SQL Editor (https://supabase.com/dashboard)
-- to confirm the email for nrkumarsg@gmail.com and auto-confirm any future signups.

-- 1. Confirm the email for nrkumarsg@gmail.com (confirmed_at is generated automatically)
UPDATE auth.users 
SET email_confirmed_at = NOW()
WHERE email = 'nrkumarsg@gmail.com';

-- 2. Auto-confirm all future sign-ups for testing convenience
CREATE OR REPLACE FUNCTION public.auto_confirm_user()
RETURNS trigger AS $$
BEGIN
  NEW.email_confirmed_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created_confirm ON auth.users;
CREATE TRIGGER on_auth_user_created_confirm
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_confirm_user();
