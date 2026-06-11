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
