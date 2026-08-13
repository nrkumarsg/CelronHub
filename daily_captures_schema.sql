-- ============================================================
-- daily_captures table for MyDay Quick Capture module
-- Run this in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS daily_captures (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      uuid REFERENCES companies(id) ON DELETE CASCADE,
    date            date DEFAULT CURRENT_DATE,
    type            text NOT NULL,
    -- type values: 'enquiry' | 'bizcard' | 'invoice' | 'delivery'
    --              'payment' | 'manual' | 'expense' | 'note'
    raw_input       text,
    ai_result       jsonb,
    drive_file_id   text,
    drive_folder_path text,
    linked_enquiry_id uuid,
    linked_job_id   uuid,
    linked_partner_id uuid,
    status          text DEFAULT 'confirmed',
    -- status values: 'pending' | 'confirmed' | 'filed' | 'error'
    created_by      uuid REFERENCES auth.users(id),
    created_at      timestamptz DEFAULT now(),
    updated_at      timestamptz DEFAULT now()
);

-- Index for daily queries
CREATE INDEX IF NOT EXISTS idx_daily_captures_company_date
    ON daily_captures (company_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_daily_captures_type
    ON daily_captures (company_id, type);

-- Row Level Security
ALTER TABLE daily_captures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access own company captures"
    ON daily_captures FOR ALL
    USING (
        company_id IN (
            SELECT company_id FROM profiles WHERE id = auth.uid()
        )
    );

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_daily_captures_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_daily_captures_updated_at
    BEFORE UPDATE ON daily_captures
    FOR EACH ROW EXECUTE FUNCTION update_daily_captures_updated_at();
