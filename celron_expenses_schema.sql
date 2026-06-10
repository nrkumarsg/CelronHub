-- ==========================================
-- CELRON EXPENSES DATABASE SCHEMA MIGRATION
-- Supports Accounts Payable (Supplier Bills) and GST Reporting
-- ==========================================

-- 1. Accounts Payable Table
CREATE TABLE IF NOT EXISTS public.accounts_payable (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_name TEXT NOT NULL,
    invoice_number TEXT,
    invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE,
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    gst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    currency TEXT NOT NULL DEFAULT 'INR',
    drive_url TEXT,
    status TEXT NOT NULL DEFAULT 'pending_approval' CHECK (status IN ('pending_approval', 'approved', 'paid', 'rejected')),
    extracted_json JSONB,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexing for high-performance sorting and searches
CREATE INDEX IF NOT EXISTS idx_ap_due_date ON public.accounts_payable(due_date);
CREATE INDEX IF NOT EXISTS idx_ap_vendor ON public.accounts_payable(vendor_name);
CREATE INDEX IF NOT EXISTS idx_ap_status ON public.accounts_payable(status);

-- 2. GST Reporting Table
CREATE TABLE IF NOT EXISTS public.gst_reporting (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_name TEXT NOT NULL,
    vendor_gstin VARCHAR(15) NOT NULL,
    taxable_value NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    cgst NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    sgst NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    igst NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_gst NUMERIC(12, 2) GENERATED ALWAYS AS (cgst + sgst + igst) STORED,
    hsn_sac_code TEXT,
    expense_category TEXT NOT NULL DEFAULT 'Office Supplies',
    drive_url TEXT,
    itc_status TEXT NOT NULL DEFAULT 'eligible' CHECK (itc_status IN ('eligible', 'ineligible', 'claimed')),
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexing for tax periods and vendor reconciliation
CREATE INDEX IF NOT EXISTS idx_gst_gstin ON public.gst_reporting(vendor_gstin);
CREATE INDEX IF NOT EXISTS idx_gst_created_at ON public.gst_reporting(created_at);
CREATE INDEX IF NOT EXISTS idx_gst_itc_status ON public.gst_reporting(itc_status);

-- 3. Row Level Security (RLS) Configuration
ALTER TABLE public.accounts_payable ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gst_reporting ENABLE ROW LEVEL SECURITY;

-- Select Policies (Allow employees to see all expense sheets for company transparency)
CREATE POLICY "Allow authenticated users to read accounts_payable" 
    ON public.accounts_payable FOR SELECT 
    TO authenticated 
    USING (true);

CREATE POLICY "Allow authenticated users to read gst_reporting" 
    ON public.gst_reporting FOR SELECT 
    TO authenticated 
    USING (true);

-- Insert/Update Policies (Allow employees to create and edit bills they uploaded)
CREATE POLICY "Allow authenticated users to insert accounts_payable" 
    ON public.accounts_payable FOR INSERT 
    TO authenticated 
    WITH CHECK (auth.uid() = created_by OR created_by IS NULL);

CREATE POLICY "Allow authenticated users to update accounts_payable" 
    ON public.accounts_payable FOR UPDATE 
    TO authenticated 
    USING (auth.uid() = created_by OR created_by IS NULL);

CREATE POLICY "Allow authenticated users to insert gst_reporting" 
    ON public.gst_reporting FOR INSERT 
    TO authenticated 
    WITH CHECK (auth.uid() = created_by OR created_by IS NULL);

CREATE POLICY "Allow authenticated users to update gst_reporting" 
    ON public.gst_reporting FOR UPDATE 
    TO authenticated 
    USING (auth.uid() = created_by OR created_by IS NULL);

-- 4. Automatically Update updated_at trigger
CREATE OR REPLACE FUNCTION public.set_current_timestamp_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_ap_timestamp
    BEFORE UPDATE ON public.accounts_payable
    FOR EACH ROW
    EXECUTE FUNCTION public.set_current_timestamp_updated_at();

CREATE TRIGGER trigger_update_gst_timestamp
    BEFORE UPDATE ON public.gst_reporting
    FOR EACH ROW
    EXECUTE FUNCTION public.set_current_timestamp_updated_at();
