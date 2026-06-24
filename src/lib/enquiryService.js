import { supabase } from './supabase';

/**
 * Fetch all customer enquiries for the current user's company
 */
export const getEnquiries = async (companyId = null) => {
    let query = supabase
        .from('customer_enquiries')
        .select(`
            *,
            customer:partners(id, name),
            contact:contacts(id, name)
        `)
        .order('created_at', { ascending: false });

    if (companyId) {
        query = query.eq('company_id', companyId);
    }

    const { data, error } = await query;
    if (error) {
        console.error('Error fetching enquiries:', error);
        throw error;
    }
    return data || [];
};

/**
 * Fetch a single enquiry by ID
 */
export const getEnquiryById = async (id) => {
    const { data, error } = await supabase
        .from('customer_enquiries')
        .select(`
            *,
            customer:partners(id, name),
            contact:contacts(id, name)
        `)
        .eq('id', id)
        .single();

    if (error) {
        console.error('Error fetching enquiry by id:', error);
        throw error;
    }
    return data;
};

/**
 * Create a new customer enquiry
 */
export const createEnquiry = async (payload) => {
    const { data, error } = await supabase
        .from('customer_enquiries')
        .insert([payload])
        .select()
        .single();

    if (error) {
        console.error('Error creating enquiry:', error);
        throw error;
    }
    return data;
};

/**
 * Update an existing customer enquiry
 */
export const updateEnquiry = async (id, payload) => {
    // Prevent updating immutable fields
    const dataToUpdate = { ...payload };
    delete dataToUpdate.id;
    delete dataToUpdate.created_at;
    delete dataToUpdate.updated_at;

    const { data, error } = await supabase
        .from('customer_enquiries')
        .update(dataToUpdate)
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('Error updating enquiry:', error);
        throw error;
    }
    return data;
};

/**
 * Delete a customer enquiry
 */
export const deleteEnquiry = async (id) => {
    const { error } = await supabase
        .from('customer_enquiries')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting enquiry:', error);
        throw error;
    }
    return true;
};

/**
 * Generate next Enquiry No: ENQ-CEL-YYMM-XXXX (starting from 1000)
 * Company-aware: ARKIS → ENQ-ARKIS-YYMM-XXXX, AIS → ENQ-AIS-YYMM-XXXX
 */
export const generateEnquiryNo = async (companyId) => {
    const today = new Date();
    const yy = String(today.getFullYear()).slice(2);
    const mm = String(today.getMonth() + 1).padStart(2, '0');

    // Determine company prefix
    let companyPrefix = 'CEL';
    if (companyId) {
        try {
            const { data: company } = await supabase
                .from('companies')
                .select('name')
                .eq('id', companyId)
                .single();
            if (company?.name) {
                const name = company.name.toUpperCase();
                if (name.includes('ARKIS')) companyPrefix = 'ARKIS';
                else if (name.includes('ARK INTERNATIONAL')) companyPrefix = 'AIS';
                else if (name.includes('CEL-RON') || name.includes('CELRON')) companyPrefix = 'CEL';
                else {
                    const stopWords = ['PTE', 'LTD', 'LIMITED', 'CO', 'CORP', 'AND', 'THE', 'OF'];
                    const words = company.name.replace(/[^a-zA-Z0-9\s]/g, '').split(/\s+/)
                        .filter(w => w && !stopWords.includes(w.toUpperCase()));
                    if (words.length >= 2) companyPrefix = words.map(w => w[0].toUpperCase()).join('');
                    else if (words.length === 1) companyPrefix = words[0].substring(0, 3).toUpperCase();
                }
            }
        } catch (e) { /* use default CEL */ }
    }

    const prefix = `ENQ-${companyPrefix}-${yy}${mm}-`;
    const START_NUM = 1000; // Starts from 1000

    const { data, error } = await supabase
        .from('customer_enquiries')
        .select('enquiry_no')
        .eq('company_id', companyId)
        .ilike('enquiry_no', `ENQ-${companyPrefix}-%`)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching latest enquiry:', error);
        return `${prefix}${String(START_NUM).padStart(4, '0')}`;
    }

    let maxNum = START_NUM - 1;
    if (data && data.length > 0) {
        data.forEach(row => {
            const parts = (row.enquiry_no || '').split('-');
            const num = parseInt(parts[parts.length - 1], 10);
            if (!isNaN(num) && num > maxNum) maxNum = num;
        });
    }

    const nextNum = Math.max(maxNum + 1, START_NUM);
    return `${prefix}${String(nextNum).padStart(4, '0')}`;
};
