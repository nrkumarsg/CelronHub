import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data, error } = await supabase
    .from('workflow_documents')
    .select('id, document_no, document_type, assigned_job_no, total_amount, status, created_at, updated_at, is_job, revision_no, original_document_id')
    .eq('assigned_job_no', 'CEL-2606-6051');

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Documents for CEL-2606-6051:');
  console.log(JSON.stringify(data, null, 2));
}

run();
