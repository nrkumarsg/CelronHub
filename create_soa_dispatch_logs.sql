-- Create Statement of Account (SOA) Dispatch Audit Logs Table
CREATE TABLE IF NOT EXISTS public.soa_dispatch_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id uuid NOT NULL,
    partner_id uuid REFERENCES public.partners(id) ON DELETE CASCADE,
    sent_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    sent_by text NOT NULL,
    recipient text NOT NULL,
    closing_balance numeric(15,2) NOT NULL,
    currency text DEFAULT 'SGD'::text NOT NULL,
    status text DEFAULT 'Success'::text NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.soa_dispatch_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS soa_logs_select ON public.soa_dispatch_logs;
DROP POLICY IF EXISTS soa_logs_insert ON public.soa_dispatch_logs;

-- Policies for RLS
CREATE POLICY soa_logs_select ON public.soa_dispatch_logs FOR SELECT USING (true);
CREATE POLICY soa_logs_insert ON public.soa_dispatch_logs FOR INSERT WITH CHECK (true);

-- Enable real-time replication if preferred
alter publication supabase_realtime add table public.soa_dispatch_logs;
