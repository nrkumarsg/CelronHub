-- =========================================================================
-- DATABASE TRIGGER & BACKFILL FOR AUTOMATIC JOBS SYNCHRONIZATION
-- =========================================================================
-- This script synchronizes the legacy 'jobs' table (used by the mobile app)
-- with the unified 'workflow_documents' table (used by the web dashboard).
--
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard)
-- =========================================================================

-- 1. Create the synchronization function
CREATE OR REPLACE FUNCTION public.sync_jobs_to_workflow_documents_func()
RETURNS TRIGGER AS $$
DECLARE
    doc_exists BOOLEAN;
BEGIN
    -- Check if record already exists in workflow_documents for this job
    SELECT EXISTS (
        SELECT 1 FROM public.workflow_documents 
        WHERE job_id = COALESCE(NEW.id, OLD.id) OR document_no = COALESCE(NEW.job_no, OLD.job_no)
    ) INTO doc_exists;

    IF (TG_OP = 'INSERT') THEN
        IF NOT doc_exists THEN
            INSERT INTO public.workflow_documents (
                id,
                company_id,
                document_type,
                document_no,
                assigned_job_no,
                status,
                partner_id,
                vessel_id,
                subject,
                is_job,
                job_id,
                created_at,
                updated_at
            ) VALUES (
                NEW.id,
                COALESCE(NEW.company_id, '8431cd0b-7449-44a5-8213-2a8680d09ebe'::uuid),
                'Job',
                NEW.job_no,
                NEW.job_no,
                COALESCE(NEW.status, 'Active'),
                NEW.customer_id,
                NEW.vessel_id,
                COALESCE(NEW.description, 'Service Job'),
                TRUE,
                NEW.id,
                NEW.created_at,
                NEW.updated_at
            );
        END IF;
    ELSIF (TG_OP = 'UPDATE') THEN
        IF doc_exists THEN
            UPDATE public.workflow_documents
            SET
                document_no = NEW.job_no,
                assigned_job_no = NEW.job_no,
                status = COALESCE(NEW.status, 'Active'),
                partner_id = NEW.customer_id,
                vessel_id = NEW.vessel_id,
                subject = COALESCE(NEW.description, 'Service Job'),
                updated_at = NEW.updated_at
            WHERE job_id = NEW.id;
        ELSE
            -- In case it was missing, insert it to keep tables aligned
            INSERT INTO public.workflow_documents (
                id,
                company_id,
                document_type,
                document_no,
                assigned_job_no,
                status,
                partner_id,
                vessel_id,
                subject,
                is_job,
                job_id,
                created_at,
                updated_at
            ) VALUES (
                NEW.id,
                COALESCE(NEW.company_id, '8431cd0b-7449-44a5-8213-2a8680d09ebe'::uuid),
                'Job',
                NEW.job_no,
                NEW.job_no,
                COALESCE(NEW.status, 'Active'),
                NEW.customer_id,
                NEW.vessel_id,
                COALESCE(NEW.description, 'Service Job'),
                TRUE,
                NEW.id,
                NEW.created_at,
                NEW.updated_at
            );
        END IF;
    ELSIF (TG_OP = 'DELETE') THEN
        DELETE FROM public.workflow_documents WHERE job_id = OLD.id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Bind the trigger to the public.jobs table
DROP TRIGGER IF EXISTS trigger_sync_jobs_to_workflow_documents ON public.jobs;
CREATE TRIGGER trigger_sync_jobs_to_workflow_documents
AFTER INSERT OR UPDATE OR DELETE ON public.jobs
FOR EACH ROW EXECUTE FUNCTION public.sync_jobs_to_workflow_documents_func();

-- 3. One-time backfill to copy existing jobs
INSERT INTO public.workflow_documents (
    id,
    company_id,
    document_type,
    document_no,
    assigned_job_no,
    status,
    partner_id,
    vessel_id,
    subject,
    is_job,
    job_id,
    created_at,
    updated_at
)
SELECT 
    j.id,
    COALESCE(j.company_id, '8431cd0b-7449-44a5-8213-2a8680d09ebe'::uuid),
    'Job',
    j.job_no,
    j.job_no,
    COALESCE(j.status, 'Active'),
    j.customer_id,
    j.vessel_id,
    COALESCE(j.description, 'Service Job'),
    TRUE,
    j.id,
    j.created_at,
    j.updated_at
FROM public.jobs j
WHERE j.id NOT IN (SELECT id FROM public.workflow_documents)
  AND j.job_no NOT IN (SELECT document_no FROM public.workflow_documents);
