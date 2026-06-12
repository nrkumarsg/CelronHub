-- manuals_schema_v2.sql
-- Run this in your Supabase SQL Editor to add required columns for AI Manual Management.

ALTER TABLE public.manuals_library ADD COLUMN IF NOT EXISTS manufacturer TEXT;
ALTER TABLE public.manuals_library ADD COLUMN IF NOT EXISTS model TEXT;
ALTER TABLE public.manuals_library ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.manuals_library ADD COLUMN IF NOT EXISTS keywords TEXT[] DEFAULT '{}';
ALTER TABLE public.manuals_library ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE public.manuals_library ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
ALTER TABLE public.manuals_library ADD COLUMN IF NOT EXISTS is_missing BOOLEAN DEFAULT FALSE;
ALTER TABLE public.manuals_library ADD COLUMN IF NOT EXISTS is_duplicate BOOLEAN DEFAULT FALSE;
ALTER TABLE public.manuals_library ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE public.manuals_library ADD COLUMN IF NOT EXISTS file_size BIGINT DEFAULT 0;
ALTER TABLE public.manuals_library ADD COLUMN IF NOT EXISTS content_extracted TEXT;

-- Index for searching extracted content
CREATE INDEX IF NOT EXISTS idx_manuals_content_extracted ON public.manuals_library USING gin(to_tsvector('english', coalesce(content_extracted, '')));
