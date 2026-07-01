-- SQL Redesign for Marine Equipment & Spare Parts Management System
-- Run this script in the Supabase SQL Editor

-- 1. Create Sequences
CREATE SEQUENCE IF NOT EXISTS system_no_seq START 1;
CREATE SEQUENCE IF NOT EXISTS model_no_seq START 1;
CREATE SEQUENCE IF NOT EXISTS spare_number_seq START 100001;

-- 2. Master Tables
CREATE TABLE IF NOT EXISTS public.catalog_departments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  company_id uuid DEFAULT 'd0000000-0000-0000-0000-000000000001'::uuid,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.catalog_equipment_groups (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  company_id uuid DEFAULT 'd0000000-0000-0000-0000-000000000001'::uuid,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.catalog_makers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  company_id uuid DEFAULT 'd0000000-0000-0000-0000-000000000001'::uuid,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.catalog_models (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  model_no text UNIQUE,
  name text NOT NULL,
  maker_id uuid REFERENCES public.catalog_makers(id) ON DELETE CASCADE,
  company_id uuid DEFAULT 'd0000000-0000-0000-0000-000000000001'::uuid,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.catalog_assemblies (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  model_id uuid REFERENCES public.catalog_models(id) ON DELETE CASCADE,
  company_id uuid DEFAULT 'd0000000-0000-0000-0000-000000000001'::uuid,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.catalog_warehouses (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  location text,
  company_id uuid DEFAULT 'd0000000-0000-0000-0000-000000000001'::uuid,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.catalog_units (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  symbol text NOT NULL,
  company_id uuid DEFAULT 'd0000000-0000-0000-0000-000000000001'::uuid,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Systems Table
CREATE TABLE IF NOT EXISTS public.marine_systems (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  system_no text UNIQUE,
  name text NOT NULL,
  department_id uuid REFERENCES public.catalog_departments(id) ON DELETE SET NULL,
  equipment_group_id uuid REFERENCES public.catalog_equipment_groups(id) ON DELETE SET NULL,
  maker_id uuid REFERENCES public.catalog_makers(id) ON DELETE SET NULL,
  model_id uuid REFERENCES public.catalog_models(id) ON DELETE SET NULL,
  company_id uuid DEFAULT 'd0000000-0000-0000-0000-000000000001'::uuid,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Unified Documents, Photos, and Notes Tables
CREATE TABLE IF NOT EXISTS public.marine_documents (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type text NOT NULL, -- 'system' or 'spare_part'
  entity_id uuid NOT NULL,
  name text NOT NULL,
  file_url text NOT NULL,
  document_type text DEFAULT 'Datasheet', -- 'Datasheet', 'Manual', 'Wiring Diagram', 'Certificate', 'Other'
  company_id uuid DEFAULT 'd0000000-0000-0000-0000-000000000001'::uuid,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.marine_photos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type text NOT NULL, -- 'system' or 'spare_part'
  entity_id uuid NOT NULL,
  url text NOT NULL,
  company_id uuid DEFAULT 'd0000000-0000-0000-0000-000000000001'::uuid,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.marine_notes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type text NOT NULL, -- 'system' or 'spare_part'
  entity_id uuid NOT NULL,
  content text NOT NULL,
  author text,
  company_id uuid DEFAULT 'd0000000-0000-0000-0000-000000000001'::uuid,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.marine_system_maintenance (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  system_id uuid REFERENCES public.marine_systems(id) ON DELETE CASCADE,
  task_name text NOT NULL,
  description text,
  interval_months integer,
  last_done_date date,
  next_due_date date,
  company_id uuid DEFAULT 'd0000000-0000-0000-0000-000000000001'::uuid,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Extend Existing catalog_items Table
ALTER TABLE public.catalog_items 
  ADD COLUMN IF NOT EXISTS system_id uuid REFERENCES public.marine_systems(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS maker_id uuid REFERENCES public.catalog_makers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS model_id uuid REFERENCES public.catalog_models(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assembly_id uuid REFERENCES public.catalog_assemblies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.catalog_warehouses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS spare_number integer DEFAULT nextval('spare_number_seq'),
  ADD COLUMN IF NOT EXISTS oem_part_no text,
  ADD COLUMN IF NOT EXISTS manufacturer_part_no text,
  ADD COLUMN IF NOT EXISTS alternative_part_numbers text,
  ADD COLUMN IF NOT EXISTS min_stock numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_stock numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lead_time text,
  ADD COLUMN IF NOT EXISTS warranty text,
  ADD COLUMN IF NOT EXISTS weight numeric,
  ADD COLUMN IF NOT EXISTS dimensions text,
  ADD COLUMN IF NOT EXISTS purchase_price numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency text DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS shelf_location text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'Active';

-- 6. Compatibility Table
CREATE TABLE IF NOT EXISTS public.spare_part_compatibility (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  spare_part_id uuid REFERENCES public.catalog_items(id) ON DELETE CASCADE,
  compatible_system_id uuid REFERENCES public.marine_systems(id) ON DELETE CASCADE,
  compatible_model_id uuid REFERENCES public.catalog_models(id) ON DELETE CASCADE,
  company_id uuid DEFAULT 'd0000000-0000-0000-0000-000000000001'::uuid,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. Audit Logs Table
CREATE TABLE IF NOT EXISTS public.marine_audit_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type text NOT NULL, -- 'system' or 'spare_part'
  entity_id uuid NOT NULL,
  action text NOT NULL, -- 'CREATE', 'UPDATE', 'DELETE', 'STOCK_ADJUST'
  changed_fields jsonb DEFAULT '{}'::jsonb,
  user_id text,
  company_id uuid DEFAULT 'd0000000-0000-0000-0000-000000000001'::uuid,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 8. Auto-generating IDs Triggers
-- System Number (SYS000001)
CREATE OR REPLACE FUNCTION generate_system_no() RETURNS trigger AS $$
BEGIN
  IF NEW.system_no IS NULL THEN
    NEW.system_no := 'SYS' || lpad(nextval('system_no_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_generate_system_no ON public.marine_systems;
CREATE TRIGGER trigger_generate_system_no
BEFORE INSERT ON public.marine_systems
FOR EACH ROW EXECUTE FUNCTION generate_system_no();

-- Model Number (MOD000001)
CREATE OR REPLACE FUNCTION generate_model_no() RETURNS trigger AS $$
BEGIN
  IF NEW.model_no IS NULL THEN
    NEW.model_no := 'MOD' || lpad(nextval('model_no_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_generate_model_no ON public.catalog_models;
CREATE TRIGGER trigger_generate_model_no
BEFORE INSERT ON public.catalog_models
FOR EACH ROW EXECUTE FUNCTION generate_model_no();

-- Auto-generating Barcode from spare_number if empty
CREATE OR REPLACE FUNCTION generate_spare_barcode() RETURNS trigger AS $$
BEGIN
  IF NEW.barcode IS NULL OR NEW.barcode = '' THEN
    NEW.barcode := NEW.spare_number::text;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_generate_spare_barcode ON public.catalog_items;
CREATE TRIGGER trigger_generate_spare_barcode
BEFORE INSERT OR UPDATE ON public.catalog_items
FOR EACH ROW EXECUTE FUNCTION generate_spare_barcode();

-- 9. Enable RLS
ALTER TABLE public.catalog_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_equipment_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_makers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_assemblies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marine_systems ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marine_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marine_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marine_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marine_system_maintenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spare_part_compatibility ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marine_audit_logs ENABLE ROW LEVEL SECURITY;

-- 10. Create RLS Policies
-- Departments
CREATE POLICY "Allow anonymous read access on departments" ON public.catalog_departments FOR SELECT USING (true);
CREATE POLICY "Allow anonymous insert access on departments" ON public.catalog_departments FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anonymous update access on departments" ON public.catalog_departments FOR UPDATE USING (true);
CREATE POLICY "Allow anonymous delete access on departments" ON public.catalog_departments FOR DELETE USING (true);

-- Equipment Groups
CREATE POLICY "Allow anonymous read access on eq_groups" ON public.catalog_equipment_groups FOR SELECT USING (true);
CREATE POLICY "Allow anonymous insert access on eq_groups" ON public.catalog_equipment_groups FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anonymous update access on eq_groups" ON public.catalog_equipment_groups FOR UPDATE USING (true);
CREATE POLICY "Allow anonymous delete access on eq_groups" ON public.catalog_equipment_groups FOR DELETE USING (true);

-- Makers
CREATE POLICY "Allow anonymous read access on makers" ON public.catalog_makers FOR SELECT USING (true);
CREATE POLICY "Allow anonymous insert access on makers" ON public.catalog_makers FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anonymous update access on makers" ON public.catalog_makers FOR UPDATE USING (true);
CREATE POLICY "Allow anonymous delete access on makers" ON public.catalog_makers FOR DELETE USING (true);

-- Models
CREATE POLICY "Allow anonymous read access on models" ON public.catalog_models FOR SELECT USING (true);
CREATE POLICY "Allow anonymous insert access on models" ON public.catalog_models FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anonymous update access on models" ON public.catalog_models FOR UPDATE USING (true);
CREATE POLICY "Allow anonymous delete access on models" ON public.catalog_models FOR DELETE USING (true);

-- Assemblies
CREATE POLICY "Allow anonymous read access on assemblies" ON public.catalog_assemblies FOR SELECT USING (true);
CREATE POLICY "Allow anonymous insert access on assemblies" ON public.catalog_assemblies FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anonymous update access on assemblies" ON public.catalog_assemblies FOR UPDATE USING (true);
CREATE POLICY "Allow anonymous delete access on assemblies" ON public.catalog_assemblies FOR DELETE USING (true);

-- Warehouses
CREATE POLICY "Allow anonymous read access on warehouses" ON public.catalog_warehouses FOR SELECT USING (true);
CREATE POLICY "Allow anonymous insert access on warehouses" ON public.catalog_warehouses FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anonymous update access on warehouses" ON public.catalog_warehouses FOR UPDATE USING (true);
CREATE POLICY "Allow anonymous delete access on warehouses" ON public.catalog_warehouses FOR DELETE USING (true);

-- Units
CREATE POLICY "Allow anonymous read access on units" ON public.catalog_units FOR SELECT USING (true);
CREATE POLICY "Allow anonymous insert access on units" ON public.catalog_units FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anonymous update access on units" ON public.catalog_units FOR UPDATE USING (true);
CREATE POLICY "Allow anonymous delete access on units" ON public.catalog_units FOR DELETE USING (true);

-- Systems
CREATE POLICY "Allow anonymous read access on systems" ON public.marine_systems FOR SELECT USING (true);
CREATE POLICY "Allow anonymous insert access on systems" ON public.marine_systems FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anonymous update access on systems" ON public.marine_systems FOR UPDATE USING (true);
CREATE POLICY "Allow anonymous delete access on systems" ON public.marine_systems FOR DELETE USING (true);

-- Documents
CREATE POLICY "Allow anonymous read access on marine_docs" ON public.marine_documents FOR SELECT USING (true);
CREATE POLICY "Allow anonymous insert access on marine_docs" ON public.marine_documents FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anonymous update access on marine_docs" ON public.marine_documents FOR UPDATE USING (true);
CREATE POLICY "Allow anonymous delete access on marine_docs" ON public.marine_documents FOR DELETE USING (true);

-- Photos
CREATE POLICY "Allow anonymous read access on marine_photos" ON public.marine_photos FOR SELECT USING (true);
CREATE POLICY "Allow anonymous insert access on marine_photos" ON public.marine_photos FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anonymous update access on marine_photos" ON public.marine_photos FOR UPDATE USING (true);
CREATE POLICY "Allow anonymous delete access on marine_photos" ON public.marine_photos FOR DELETE USING (true);

-- Notes
CREATE POLICY "Allow anonymous read access on marine_notes" ON public.marine_notes FOR SELECT USING (true);
CREATE POLICY "Allow anonymous insert access on marine_notes" ON public.marine_notes FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anonymous update access on marine_notes" ON public.marine_notes FOR UPDATE USING (true);
CREATE POLICY "Allow anonymous delete access on marine_notes" ON public.marine_notes FOR DELETE USING (true);

-- Maintenance
CREATE POLICY "Allow anonymous read access on maintenance" ON public.marine_system_maintenance FOR SELECT USING (true);
CREATE POLICY "Allow anonymous insert access on maintenance" ON public.marine_system_maintenance FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anonymous update access on maintenance" ON public.marine_system_maintenance FOR UPDATE USING (true);
CREATE POLICY "Allow anonymous delete access on maintenance" ON public.marine_system_maintenance FOR DELETE USING (true);

-- Compatibility
CREATE POLICY "Allow anonymous read access on compatibility" ON public.spare_part_compatibility FOR SELECT USING (true);
CREATE POLICY "Allow anonymous insert access on compatibility" ON public.spare_part_compatibility FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anonymous update access on compatibility" ON public.spare_part_compatibility FOR UPDATE USING (true);
CREATE POLICY "Allow anonymous delete access on compatibility" ON public.spare_part_compatibility FOR DELETE USING (true);

-- Audit Logs
CREATE POLICY "Allow anonymous read access on audit_logs" ON public.marine_audit_logs FOR SELECT USING (true);
CREATE POLICY "Allow anonymous insert access on audit_logs" ON public.marine_audit_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anonymous update access on audit_logs" ON public.marine_audit_logs FOR UPDATE USING (true);
CREATE POLICY "Allow anonymous delete access on audit_logs" ON public.marine_audit_logs FOR DELETE USING (true);

-- 11. Create Indexes for 1M+ scaling and fast searches
CREATE INDEX IF NOT EXISTS idx_systems_no ON public.marine_systems(system_no);
CREATE INDEX IF NOT EXISTS idx_systems_name ON public.marine_systems(name);
CREATE INDEX IF NOT EXISTS idx_catalog_items_system_id ON public.catalog_items(system_id);
CREATE INDEX IF NOT EXISTS idx_catalog_items_spare_number ON public.catalog_items(spare_number);
CREATE INDEX IF NOT EXISTS idx_catalog_items_oem_part_no ON public.catalog_items(oem_part_no);
CREATE INDEX IF NOT EXISTS idx_catalog_items_mfr_part_no ON public.catalog_items(manufacturer_part_no);
CREATE INDEX IF NOT EXISTS idx_catalog_items_warehouse_id ON public.catalog_items(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_compatibility_spare_part_id ON public.spare_part_compatibility(spare_part_id);
CREATE INDEX IF NOT EXISTS idx_compatibility_system_id ON public.spare_part_compatibility(compatible_system_id);
CREATE INDEX IF NOT EXISTS idx_documents_entity ON public.marine_documents(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_photos_entity ON public.marine_photos(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_notes_entity ON public.marine_notes(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.marine_audit_logs(entity_type, entity_id);
