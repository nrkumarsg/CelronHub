-- 1. Create audit_logs table
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    user_email TEXT,
    company_id UUID, -- Removed strict foreign key references constraint to prevent triggers from blocking saves
    action_type TEXT NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'SCAN_OCR', 'EXPORT' etc.
    table_name TEXT,
    record_id UUID,
    old_data JSONB,
    new_data JSONB,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 3. Drop existing policies if any
DROP POLICY IF EXISTS "Allow authenticated users to insert logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Allow superadmin to read logs" ON public.audit_logs;

-- 4. Create Policies:
-- Allow authenticated users to insert logs so client-side actions can be recorded
CREATE POLICY "Allow authenticated users to insert logs" ON public.audit_logs
FOR INSERT TO authenticated WITH CHECK (true);

-- Only allow superadmin to read logs
CREATE POLICY "Allow superadmin to read logs" ON public.audit_logs
FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'superadmin'
    )
);

-- 5. Create trigger function
CREATE OR REPLACE FUNCTION public.process_audit_log()
RETURNS TRIGGER AS $$
DECLARE
    curr_user_email TEXT;
    curr_company_id UUID;
    record_id UUID;
    old_val JSONB := NULL;
    new_val JSONB := NULL;
BEGIN
    -- Fetch profile info of current user
    SELECT email, company_id INTO curr_user_email, curr_company_id
    FROM public.profiles
    WHERE id = auth.uid();

    -- Determine record ID and serialized data
    IF (TG_OP = 'DELETE') THEN
        record_id := OLD.id;
        old_val := to_jsonb(OLD);
        -- If company_id is NULL from profile, try to grab from OLD record
        IF curr_company_id IS NULL THEN
            BEGIN curr_company_id := OLD.company_id; EXCEPTION WHEN OTHERS THEN END;
        END IF;
    ELSE
        record_id := NEW.id;
        IF (TG_OP = 'INSERT') THEN
            new_val := to_jsonb(NEW);
        ELSIF (TG_OP = 'UPDATE') THEN
            old_val := to_jsonb(OLD);
            new_val := to_jsonb(NEW);
        END IF;
        
        -- If company_id is NULL from profile, try to grab from NEW record
        IF curr_company_id IS NULL THEN
            BEGIN curr_company_id := NEW.company_id; EXCEPTION WHEN OTHERS THEN END;
        END IF;
    END IF;

    -- If still NULL, default to demo company
    IF curr_company_id IS NULL THEN
        curr_company_id := 'd0000000-0000-0000-0000-000000000001';
    END IF;

    -- Insert into audit logs table
    INSERT INTO public.audit_logs (
        user_id,
        user_email,
        company_id,
        action_type,
        table_name,
        record_id,
        old_data,
        new_data,
        metadata
    ) VALUES (
        auth.uid(),
        COALESCE(curr_user_email, 'system-trigger@celron.ae'),
        curr_company_id,
        TG_OP,
        TG_TABLE_NAME,
        record_id,
        old_val,
        new_val,
        jsonb_build_object('trigger', true, 'client_ip', null)
    );

    IF (TG_OP = 'DELETE') THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Attach triggers to key tables
-- We will drop triggers if they exist and recreate them
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' 
    AND table_name IN ('partners', 'contacts', 'vessels', 'work_locations', 'enquiries', 'jobs', 'quotations', 'invoices') LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS audit_trigger ON public.%I', t);
        EXECUTE format('CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.process_audit_log()', t);
    END LOOP;
END $$;
