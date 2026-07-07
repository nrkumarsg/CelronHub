-- manuals_schema_v3.sql
-- Add relationship columns to public.manuals_library for Maker, Model, and Machinery Systems.

ALTER TABLE public.manuals_library ADD COLUMN IF NOT EXISTS system_id UUID REFERENCES public.marine_systems(id) ON DELETE SET NULL;
ALTER TABLE public.manuals_library ADD COLUMN IF NOT EXISTS maker_id UUID REFERENCES public.catalog_makers(id) ON DELETE SET NULL;
ALTER TABLE public.manuals_library ADD COLUMN IF NOT EXISTS model_id UUID REFERENCES public.catalog_models(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_manuals_library_system_id ON public.manuals_library(system_id);
CREATE INDEX IF NOT EXISTS idx_manuals_library_maker_id ON public.manuals_library(maker_id);
CREATE INDEX IF NOT EXISTS idx_manuals_library_model_id ON public.manuals_library(model_id);
