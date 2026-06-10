-- 1. Ensure ownership columns exist on ALL tables
DO $$ 
BEGIN
    -- Partners
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='partners' AND column_name='company_id') THEN
        ALTER TABLE public.partners ADD COLUMN company_id uuid;
    END IF;

    -- Contacts
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='contacts' AND column_name='company_id') THEN
        ALTER TABLE public.contacts ADD COLUMN company_id uuid;
    END IF;

    -- Vessels
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vessels' AND column_name='company_id') THEN
        ALTER TABLE public.vessels ADD COLUMN company_id uuid;
    END IF;

    -- Work Locations
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='work_locations' AND column_name='company_id') THEN
        ALTER TABLE public.work_locations ADD COLUMN company_id uuid;
    END IF;

    -- Categories
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='categories' AND column_name='company_id') THEN
        ALTER TABLE public.categories ADD COLUMN company_id uuid;
    END IF;

    -- Brands
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='brands' AND column_name='company_id') THEN
        ALTER TABLE public.brands ADD COLUMN company_id uuid;
    END IF;
    
    -- Enquiries
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='enquiries' AND column_name='company_id') THEN
        ALTER TABLE public.enquiries ADD COLUMN company_id uuid;
    END IF;

    -- Jobs
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jobs' AND column_name='company_id') THEN
        ALTER TABLE public.jobs ADD COLUMN company_id uuid;
    END IF;
END $$;

-- 2. Ensure the Demo Company exists
INSERT INTO public.companies (id, name) 
VALUES ('d0000000-0000-0000-0000-000000000001', 'Cel-Ron Global') 
ON CONFLICT (id) DO NOTHING;

-- 2. Create the Profile Creation Trigger Function
-- This automatically creates a profile for every new user who signs up.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role, status, company_id, accessible_modules)
  VALUES (
    new.id, 
    new.email, 
    CASE WHEN LOWER(new.email) = 'nrkumarsg@gmail.com' THEN 'superadmin' ELSE 'user' END, 
    'active', 
    'd0000000-0000-0000-0000-000000000001', -- Assign to the default demo company
    '{"partners", "contacts", "vessels", "work-locations", "catalog", "reports", "settings", "todo", "notes", "calendar", "workflows", "universal-finder", "storage-directory"}'::text[]
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Apply the Trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. Align existing data to the Demo Company
-- This ensures all your current data is visible to anyone assigned to the demo company.
UPDATE public.partners SET company_id = 'd0000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
UPDATE public.contacts SET company_id = 'd0000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
UPDATE public.vessels SET company_id = 'd0000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
UPDATE public.work_locations SET company_id = 'd0000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
UPDATE public.categories SET company_id = 'd0000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
UPDATE public.brands SET company_id = 'd0000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;

-- 5. Force RLS to be permissive for ALL authenticated users (Demo Mode)
-- This removes any complex filtering and just lets logged-in users see the data.
DO $$ 
DECLARE
  t text;
BEGIN
  FOR t IN SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' 
  AND table_name IN ('partners', 'contacts', 'vessels', 'work_locations', 'categories', 'brands', 'profiles', 'enquiries', 'jobs') LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Enable all for authenticated users" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

-- 6. Ensure todos and notes remain PERSONAL based on user_id
-- We don't want everyone seeing everyone's private todos even in demo.
ALTER TABLE public.todos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own todos" ON public.todos;
CREATE POLICY "Users can manage their own todos" ON public.todos FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Notes are private" ON public.notes;
CREATE POLICY "Notes are private" ON public.notes FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 7. Backfill profiles for existing users who signed up before the trigger
INSERT INTO public.profiles (id, email, role, status, company_id, accessible_modules)
SELECT id, email, 'superadmin', 'active', 'd0000000-0000-0000-0000-000000000001', 
'{"partners", "contacts", "vessels", "work-locations", "catalog", "reports", "settings", "todo", "notes", "calendar"}'::text[]
FROM auth.users
ON CONFLICT (id) DO NOTHING;
