import { supabase } from './supabase';

export const getJobExpenses = async (jobId) => {
    try {
        const { data, error } = await supabase
            .from('job_expenses')
            .select(`
                *,
                partner:supplier_id (id, name)
            `)
            .eq('job_id', jobId)
            .order('created_at', { ascending: true });

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        console.error('Error fetching job expenses:', error);
        return { data: null, error };
    }
};

const ensureLegacyJobRecord = async (jobId, companyId) => {
    if (!jobId) return;
    try {
        // 1. Check if job already exists in legacy jobs table
        const { data: existingJob } = await supabase
            .from('jobs')
            .select('id')
            .eq('id', jobId)
            .maybeSingle();
            
        if (existingJob) return; // Already exists
        
        // 2. Fetch the job details from workflow_documents
        const { data: doc, error: docErr } = await supabase
            .from('workflow_documents')
            .select('document_no, document_type, company_id')
            .eq('id', jobId)
            .single();
            
        if (docErr || !doc) {
            console.error('Failed to fetch job document for legacy jobs table sync:', docErr);
            return;
        }
        
        // Determine type (default to 'Service' if not matching CHECK constraint)
        const jobType = doc.document_type === 'Supply' ? 'Supply' : 'Service';
        
        // 3. Insert into legacy jobs table
        const { error: insertErr } = await supabase
            .from('jobs')
            .insert([{
                id: jobId,
                job_no: doc.document_no,
                company_id: doc.company_id || companyId,
                type: jobType,
                status: 'Active'
            }]);
            
        if (insertErr) {
            console.error('Failed to insert legacy job sync record:', insertErr);
        } else {
            console.log(`Successfully synchronized job ${doc.document_no} to legacy jobs table`);
        }
    } catch (err) {
        console.error('Error in ensureLegacyJobRecord:', err);
    }
};

export const saveJobExpense = async (expense) => {
    try {
        const payload = { ...expense };
        const id = payload.id;
        delete payload.id;
        delete payload.created_at;
        delete payload.partner; // Remove joined data
        delete payload.job; // Remove joined data

        // Clean empty UUID fields to null
        if (payload.supplier_id === '') payload.supplier_id = null;
        if (payload.job_id === '') payload.job_id = null;
        if (payload.company_id === '') payload.company_id = null;

        if (payload.job_id) {
            await ensureLegacyJobRecord(payload.job_id, payload.company_id);
        }

        let result;
        if (id && !id.startsWith('temp_')) {
            result = await supabase
                .from('job_expenses')
                .update(payload)
                .eq('id', id)
                .select()
                .single();
        } else {
            result = await supabase
                .from('job_expenses')
                .insert([payload])
                .select()
                .single();
        }

        if (result.error) throw result.error;
        return { data: result.data, error: null };
    } catch (error) {
        console.error('Error saving job expense:', error);
        return { data: null, error };
    }
};

export const deleteJobExpense = async (id) => {
    try {
        const { error } = await supabase
            .from('job_expenses')
            .delete()
            .eq('id', id);

        if (error) throw error;
        return { error: null };
    } catch (error) {
        console.error('Error deleting job expense:', error);
        return { error };
    }
};
export const getGlobalExpenses = async (companyId) => {
    try {
        const { data, error } = await supabase
            .from('job_expenses')
            .select(`
                *,
                partner:supplier_id (id, name, uen),
                job:job_id (id, job_no)
            `)
            .eq('company_id', companyId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        console.error('Error fetching global expenses:', error);
        return { data: null, error };
    }
};

export const updateExpenseStatus = async (id, status) => {
    try {
        const { data, error } = await supabase
            .from('job_expenses')
            .update({ status })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        console.error('Error updating expense status:', error);
        return { data: null, error };
    }
};
