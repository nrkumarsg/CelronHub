import { supabase } from './supabase';

// Helper to pad numbers
const padZero = (num, length) => String(num).padStart(length, '0');

// Generate next Enquiry No: ECEL-YYMM-DDXX (resets daily)
export const generateEnquiryNo = async (companyId) => {
    const today = new Date();
    const yy = String(today.getFullYear()).slice(2);
    const mm = padZero(today.getMonth() + 1, 2);
    const dd = padZero(today.getDate(), 2);
    const prefix = `ECEL-${yy}${mm}-${dd}`;

    const { data, error } = await supabase
        .from('customer_enquiries')
        .select('enquiry_no')
        .eq('company_id', companyId)
        .ilike('enquiry_no', `${prefix}%`)
        .order('created_at', { ascending: false })
        .limit(1);

    if (error) {
        console.error('Error fetching latest enquiry:', error);
        return `${prefix}01`;
    }

    if (data && data.length > 0) {
        const lastNo = data[0].enquiry_no;
        const lastIncremental = parseInt(lastNo.slice(-2), 10);
        if (!isNaN(lastIncremental)) {
            return `${prefix}${padZero(lastIncremental + 1, 2)}`;
        }
    }

    return `${prefix}01`;
};

// Generate next Job No: CELYYMM-XXXX where XXXX starts from 5001
export const generateJobNo = async (companyId, companyPrefix = 'CEL') => {
    const today = new Date();
    const yy = String(today.getFullYear()).slice(2);
    const mm = padZero(today.getMonth() + 1, 2);
    const prefix = `${companyPrefix}${yy}${mm}-`;

    const { data, error } = await supabase
        .from('jobs')
        .select('job_no')
        .eq('company_id', companyId)
        .ilike('job_no', `${prefix}%`)
        .order('created_at', { ascending: false })
        .limit(1);

    if (error) {
        console.error('Error fetching latest job:', error);
        return `${prefix}5001`;
    }

    if (data && data.length > 0) {
        const lastNo = data[0].job_no;
        const parts = lastNo.split('-');
        const lastIncremental = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(lastIncremental)) {
            return `${prefix}${lastIncremental + 1}`;
        }
    }

    return `${prefix}5001`;
};

// ... existing CRUD operations for Enquiries, Jobs ...

// Delivery Orders
export const getDeliveryOrders = async (companyId, jobId = null) => {
    let query = supabase
        .from('delivery_orders')
        .select(`*, jobs(job_no), vessels(vessel_name)`)
        .eq('company_id', companyId);

    if (jobId) query = query.eq('job_id', jobId);

    const { data, error } = await query.order('created_at', { ascending: false });
    return { data, error };
};

export const createDeliveryOrder = async (doData) => {
    const { data, error } = await supabase.from('delivery_orders').insert([doData]).select().single();
    return { data, error };
};

// Job Expenses (CRUD)
export const getJobExpenses = async (companyId, jobId) => {
    const { data, error } = await supabase
        .from('job_expenses')
        .select('*')
        .eq('company_id', companyId)
        .eq('job_id', jobId)
        .order('created_at', { ascending: true });
    return { data, error };
};

export const createJobExpense = async (expenseData) => {
    const { data, error } = await supabase.from('job_expenses').insert([expenseData]).select().single();
    return { data, error };
};

export const updateJobExpense = async (id, updateData) => {
    const { data, error } = await supabase.from('job_expenses').update(updateData).eq('id', id).select().single();
    return { data, error };
};

export const deleteJobExpense = async (id) => {
    const { error } = await supabase.from('job_expenses').delete().eq('id', id);
    return { error };
};

// Supplier Quotes
export const getSupplierQuotes = async (enquiryId) => {
    const { data, error } = await supabase
        .from('supplier_quotes')
        .select(`*, supplier:partners(name)`)
        .eq('enquiry_id', enquiryId)
        .order('created_at', { ascending: true });
    return { data, error };
};

export const saveSupplierQuote = async (quoteData) => {
    const { id, ...payload } = quoteData;
    if (id) {
        return await supabase.from('supplier_quotes').update(payload).eq('id', id).select().single();
    }
    return await supabase.from('supplier_quotes').insert([payload]).select().single();
};

export const shortlistSupplierQuote = async (enquiryId, quoteId) => {
    // 1. Mark all as Received (reset)
    await supabase.from('supplier_quotes').update({ status: 'Received' }).eq('enquiry_id', enquiryId);

    // 2. Mark specific as Shortlisted
    const { data, error } = await supabase.from('supplier_quotes').update({ status: 'Shortlisted' }).eq('id', quoteId).select().single();
    return { data, error };
};

export const trackFloatedRFQ = async (enquiryId, supplierIds, companyId) => {
    // Check for existing records to avoid duplicates
    const { data: existing } = await supabase
        .from('supplier_quotes')
        .select('supplier_id')
        .eq('enquiry_id', enquiryId);
    
    const existingIds = existing?.map(e => e.supplier_id) || [];
    const newSupplierIds = supplierIds.filter(id => !existingIds.includes(id));

    if (newSupplierIds.length === 0) return { success: true };

    const records = newSupplierIds.map(sid => ({
        enquiry_id: enquiryId,
        supplier_id: sid,
        company_id: companyId,
        status: 'Pending',
        quote_amount: 0
    }));

    const { error } = await supabase.from('supplier_quotes').insert(records);
    return { success: !error, error };
};

// ... rest of the file ...

// ... other CRUD operations for Enquiries, Jobs, etc.
// Enquiries
export const getEnquiries = async (companyId) => {
    const { data, error } = await supabase
        .from('customer_enquiries')
        .select(`*, customer:partners!customer_id(name), contact:contacts!contact_id(name)`)
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
    return { data, error };
};

export const getEnquiryById = async (companyId, enquiryId) => {
    // 1. Try to find in customer_enquiries (V1)
    const { data: v1Data, error: v1Error } = await supabase
        .from('customer_enquiries')
        .select(`*, customer:partners!customer_id(name), contact:contacts!contact_id(name)`)
        .eq('company_id', companyId)
        .eq('id', enquiryId)
        .maybeSingle();

    if (v1Data) {
        return { data: v1Data, error: null };
    }

    // 2. If not found, try to find in workflow_documents (V2)
    const { data: v2Data, error: v2Error } = await supabase
        .from('workflow_documents')
        .select(`*, customer:partners!partner_id(name), contact:contacts!contact_id(name)`)
        .eq('company_id', companyId)
        .eq('id', enquiryId)
        .eq('document_type', 'Enquiry')
        .maybeSingle();

    if (v2Data) {
        // Fetch its line items from workflow_line_items
        const { data: items } = await supabase
            .from('workflow_line_items')
            .select('*')
            .eq('document_id', enquiryId)
            .order('sort_order', { ascending: true });

        // Map V2 data to V1 format
        const mappedData = {
            id: v2Data.id,
            enquiry_no: v2Data.document_no,
            company_id: v2Data.company_id,
            customer_id: v2Data.partner_id,
            contact_id: v2Data.contact_id,
            vessel_id: v2Data.vessel_id,
            work_location_id: v2Data.work_location_id,
            enquiry_date: v2Data.issue_date,
            due_date: v2Data.expiry_date,
            source_type: 'Email', // fallback
            description: v2Data.subject || '',
            gdrive_file_id: null,
            gdrive_file_link: null,
            gdrive_folder_id: v2Data.gdrive_folder_id,
            customer_ref: v2Data.customer_ref,
            status: v2Data.status,
            customer: v2Data.customer,
            contact: v2Data.contact,
            catalog_items: (items || []).map(item => ({
                id: item.id,
                catalog_id: item.item_id,
                name: item.description,
                description: item.description,
                specification: item.details || '',
                details: item.details || '',
                qty: item.quantity,
                quantity: item.quantity,
                unit: item.uom,
                uom: item.uom,
                unit_price: item.unit_price,
                amount: item.amount,
                tax_rate: item.tax_rate,
                tax_enabled: item.tax_enabled,
                is_section: item.is_section,
                is_note: item.is_note
            })),
            isV2: true
        };

        return { data: mappedData, error: null };
    }

    return { data: null, error: v1Error || v2Error };
};

export const createEnquiry = async (enquiryData) => {
    const { data, error } = await supabase.from('customer_enquiries').insert([enquiryData]).select().single();
    return { data, error };
};

export const updateEnquiry = async (id, updateData) => {
    // 1. Check if ID exists in workflow_documents (V2)
    const { data: v2Check } = await supabase
        .from('workflow_documents')
        .select('id')
        .eq('id', id)
        .maybeSingle();

    if (v2Check) {
        // Map V1 updates back to V2 columns
        const v2Update = {};
        if (updateData.customer_id !== undefined) v2Update.partner_id = updateData.customer_id;
        if (updateData.contact_id !== undefined) v2Update.contact_id = updateData.contact_id;
        if (updateData.vessel_id !== undefined) v2Update.vessel_id = updateData.vessel_id;
        if (updateData.work_location_id !== undefined) v2Update.work_location_id = updateData.work_location_id;
        if (updateData.enquiry_date !== undefined) v2Update.issue_date = updateData.enquiry_date;
        if (updateData.due_date !== undefined) v2Update.expiry_date = updateData.due_date;
        if (updateData.description !== undefined) v2Update.subject = updateData.description;
        if (updateData.customer_ref !== undefined) v2Update.customer_ref = updateData.customer_ref;
        if (updateData.status !== undefined) v2Update.status = updateData.status;
        if (updateData.gdrive_folder_id !== undefined) v2Update.gdrive_folder_id = updateData.gdrive_folder_id;

        let headerData = null, headerErr = null;
        if (Object.keys(v2Update).length > 0) {
            const { data, error } = await supabase
                .from('workflow_documents')
                .update(v2Update)
                .eq('id', id)
                .select()
                .single();
            headerData = data;
            headerErr = error;
        }

        // Handle line items if catalog_items is provided
        if (updateData.catalog_items !== undefined) {
            // Delete old items
            await supabase.from('workflow_line_items').delete().eq('document_id', id);
            
            // Insert new items
            const itemsToInsert = updateData.catalog_items.map((item, index) => ({
                document_id: id,
                item_id: item.catalog_id || null,
                description: item.name || item.description || '',
                details: item.specification || item.details || '',
                quantity: item.qty || item.quantity || 1,
                uom: item.unit || item.uom || 'Units',
                unit_price: item.unit_price || 0,
                amount: item.amount || 0,
                tax_rate: item.tax_rate || 9.0,
                tax_enabled: item.tax_enabled !== undefined ? item.tax_enabled : true,
                is_section: item.is_section || false,
                is_note: item.is_note || false,
                sort_order: index
            }));

            const { error: insertErr } = await supabase
                .from('workflow_line_items')
                .insert(itemsToInsert);

            if (insertErr) headerErr = insertErr;
        }

        return { data: headerData, error: headerErr };
    }

    // 2. Otherwise, update customer_enquiries (V1)
    const { data, error } = await supabase.from('customer_enquiries').update(updateData).eq('id', id).select().single();
    return { data, error };
};

// Jobs
export const getJobs = async (companyId) => {
    const { data, error } = await supabase
        .from('jobs')
        .select(`*, partners!customer_id(name), vessels!vessel_id(vessel_name), enquiries:customer_enquiries(enquiry_no, source_type, customer:partners!customer_id(name), gdrive_folder_id), job_expenses(amount)`)
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
    return { data, error };
};

export const getJobById = async (companyId, jobId) => {
    const { data, error } = await supabase
        .from('jobs')
        .select(`*, partners!customer_id(name, email1, address, phone1), vessels!vessel_id(vessel_name), enquiries:customer_enquiries(enquiry_no, source_type, customer_id, customer:partners!customer_id(name, address, email1), gdrive_folder_id), job_expenses(*)`)
        .eq('company_id', companyId)
        .eq('id', jobId)
        .single();
    return { data, error };
};

export const createJob = async (jobData) => {
    const { data, error } = await supabase.from('jobs').insert([jobData]).select().single();

    // Also mark the original enquiry as Converted
    if (jobData.enquiry_id && !error) {
        await supabase.from('customer_enquiries').update({ status: 'Converted' }).eq('id', jobData.enquiry_id);
    }

    return { data, error };
};

export const updateJob = async (id, updateData) => {
    const { data, error } = await supabase.from('jobs').update(updateData).eq('id', id).select().single();
    return { data, error };
};

// Purchase Orders (Finance Tracking for Jobs)
export const getPurchaseOrders = async (companyId, jobId) => {
    const { data, error } = await supabase
        .from('purchase_orders')
        .select('*')
        .eq('company_id', companyId)
        .eq('job_id', jobId)
        .order('created_at', { ascending: true });
    return { data, error };
};

export const createPurchaseOrder = async (poData) => {
    const { data, error } = await supabase.from('purchase_orders').insert([poData]).select().single();
    return { data, error };
};


// Documents Manager
export const getDocuments = async (companyId, referenceType, referenceId) => {
    const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('company_id', companyId)
        .eq('reference_type', referenceType)
        .eq('reference_id', referenceId)
        .order('created_at', { ascending: false });
    return { data, error };
};

export const addDocumentLink = async (docData) => {
    const { data, error } = await supabase.from('documents').insert([docData]).select().single();
    return { data, error };
};

// Deletions
export const deleteEnquiry = async (id) => {
    const { error } = await supabase.from('customer_enquiries').delete().eq('id', id);
    return { error };
};

export const deleteJob = async (id) => {
    const { error } = await supabase.from('jobs').delete().eq('id', id);
    return { error };
};

export const deleteDocument = async (id) => {
    const { error } = await supabase.from('documents').delete().eq('id', id);
    return { error };
};

