import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dfoihdzpgkrtyerzzchm.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmb2loZHpwZ2tydHllcnp6Y2htIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1NzMxMTgsImV4cCI6MjA4NzE0OTExOH0.9FGN21KeUpS0UyyFJJ1YjXLElL4AF6ym_hKAJsr_ek4';

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false }
});

async function run() {
    console.log('Querying top 20 workflow documents globally...');
    const { data: docs, error: fetchErr } = await supabase
        .from('workflow_documents')
        .select('id, document_no, document_type, total_amount, assigned_job_no, created_at')
        .order('created_at', { ascending: false })
        .limit(30);

    if (fetchErr) {
        console.error('Fetch error:', fetchErr);
        return;
    }

    console.log('Found recent workflow documents count:', docs?.length);
    if (docs) {
        docs.forEach(d => console.log(`- ${d.document_type} | ${d.document_no} | Job: ${d.assigned_job_no}`));
    }

    const targets = (docs || []).filter(d => d.document_no && (d.document_no.endsWith('6061C') || d.document_no.endsWith('6061D')));
    console.log('Target extra DOs to delete:', targets.map(t => t.document_no));

    if (targets.length > 0) {
        const ids = targets.map(t => t.id);
        const { error: delErr } = await supabase
            .from('workflow_documents')
            .delete()
            .in('id', ids);

        if (delErr) console.error('Delete error:', delErr);
        else console.log('Successfully deleted target extra test DOs:', targets.map(t => t.document_no));
    }
}

run();
