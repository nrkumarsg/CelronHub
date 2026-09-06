/**
 * Supplier Hub Pro Service
 * Handles data operations specific to the UnifiedSupplierHubPro module.
 */

import { supabase } from './supabase';

// ─── Status Buckets ──────────────────────────────────────────────────────────
export const STATUS_BUCKETS = {
    draft:      ['New', 'Open'],
    floated:    ['RFQ Floated'],
    quoted:     ['Quoted', 'Quote Sent'],
    ordered:    ['Job Created'],
    closed:     ['Closed', 'Cancelled'],
};

/**
 * Fetch all enquiries with full relational data for the Hub-Pro dashboard.
 */
export const getEnquiriesWithFullData = async (companyId) => {
    const { data, error } = await supabase
        .from('customer_enquiries')
        .select(`
            *,
            customer:partners(id, name, email, country),
            contact:contacts(id, name, email, handphone),
            supplier_quotes(
                id, status, quote_amount,
                supplier:partners(id, name, email)
            ),
            workflow_documents(
                id, document_type, document_no, status, total_amount
            )
        `)
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
};

/**
 * Compute KPI counts from an enquiry array.
 * Returns { draft, floated, quoted, ordered, overdue, total }
 */
export const computeKPIs = (enquiries = []) => {
    const now = new Date();
    return {
        draft:   enquiries.filter(e => STATUS_BUCKETS.draft.includes(e.status)).length,
        floated: enquiries.filter(e => STATUS_BUCKETS.floated.includes(e.status)).length,
        quoted:  enquiries.filter(e => STATUS_BUCKETS.quoted.includes(e.status)).length,
        ordered: enquiries.filter(e => STATUS_BUCKETS.ordered.includes(e.status)).length,
        overdue: enquiries.filter(e =>
            e.due_date &&
            new Date(e.due_date) < now &&
            !STATUS_BUCKETS.closed.includes(e.status) &&
            !STATUS_BUCKETS.ordered.includes(e.status)
        ).length,
        total: enquiries.length,
    };
};

/**
 * Filter enquiries by dashboard sub-tab.
 * tab: 'all' | 'draft' | 'floated' | 'quoted' | 'ordered'
 */
export const filterEnquiriesByTab = (enquiries = [], tab = 'all', searchQuery = '') => {
    let filtered = enquiries;

    if (tab !== 'all' && STATUS_BUCKETS[tab]) {
        filtered = filtered.filter(e => STATUS_BUCKETS[tab].includes(e.status));
    }

    if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        filtered = filtered.filter(e =>
            (e.enquiry_no || '').toLowerCase().includes(q) ||
            (e.customer?.name || '').toLowerCase().includes(q) ||
            (e.description || '').replace(/<[^>]*>/g, '').toLowerCase().includes(q)
        );
    }

    return filtered;
};

/**
 * Fetch jobs (workflow_documents of type 'Job' or 'Job Suite') for the Job Link tab.
 * Returns jobs with their partner and stage info.
 */
export const getJobsForHubPro = async (companyId) => {
    const { data, error } = await supabase
        .from('workflow_documents')
        .select(`
            id, document_no, document_type, assigned_job_no,
            status, total_amount, created_at, expiry_date,
            partners:partner_id(id, name),
            vessels:vessel_id(vessel_name),
            work_locations:work_location_id(location_name),
            customer_ref, currency
        `)
        .eq('company_id', companyId)
        .in('document_type', ['Job', 'Job Suite'])
        .order('created_at', { ascending: false })
        .limit(200);

    if (error) throw error;
    return data || [];
};

/**
 * Upsert a supplier from the inline web-search add form.
 * If name+email matches an existing partner, update; otherwise insert.
 */
export const upsertSupplierFromSearch = async (payload, companyId) => {
    const { name, email, phone, website, country, notes } = payload;

    // Check if partner with same email already exists
    if (email) {
        const { data: existing } = await supabase
            .from('partners')
            .select('id, name, email, types')
            .eq('company_id', companyId)
            .ilike('email', email.trim())
            .maybeSingle();

        if (existing) {
            // Ensure Supplier type is in types array
            const updatedTypes = Array.from(new Set([...(existing.types || []), 'Supplier']));
            const { data, error } = await supabase
                .from('partners')
                .update({
                    types: updatedTypes,
                    ...(phone ? { phone } : {}),
                    ...(website ? { website } : {}),
                    ...(country ? { country } : {}),
                })
                .eq('id', existing.id)
                .select()
                .single();
            if (error) throw error;
            return { data, isNew: false };
        }
    }

    // Insert new partner
    const { data, error } = await supabase
        .from('partners')
        .insert([{
            name: name.trim(),
            email: email?.trim() || null,
            phone: phone?.trim() || null,
            website: website?.trim() || null,
            country: country?.trim() || null,
            types: ['Supplier'],
            company_id: companyId,
            notes: notes || null,
        }])
        .select()
        .single();

    if (error) throw error;
    return { data, isNew: true };
};

/**
 * Save the Drive folder ID back to the enquiry record.
 */
export const saveEnquiryDriveFolderId = async (enquiryId, folderId) => {
    const { data, error } = await supabase
        .from('customer_enquiries')
        .update({ gdrive_folder_id: folderId })
        .eq('id', enquiryId)
        .select('id, gdrive_folder_id')
        .single();

    if (error) throw error;
    return data;
};

// ─── Web-Search Link Builder ─────────────────────────────────────────────────

/**
 * Build a list of supplier search links for a given part name / part number.
 * Opens in new tab — no API key required.
 */
export const buildSupplierSearchLinks = (partName = '', partNo = '') => {
    const query = [partName, partNo].filter(Boolean).join(' ').trim();
    if (!query) return [];

    const encoded = encodeURIComponent(query);

    return [
        {
            label: 'Google Search',
            icon: '🔍',
            color: '#4285f4',
            url: `https://www.google.com/search?q=${encoded}+supplier+singapore`,
        },
        {
            label: 'Alibaba',
            icon: '🟠',
            color: '#ff6a00',
            url: `https://www.alibaba.com/trade/search?SearchText=${encoded}`,
        },
        {
            label: 'AliExpress',
            icon: '🟥',
            color: '#e62e04',
            url: `https://www.aliexpress.com/wholesale?SearchText=${encoded}`,
        },
        {
            label: 'IndiaMART',
            icon: '🇮🇳',
            color: '#30a64a',
            url: `https://www.indiamart.com/search.mp?ss=${encoded}`,
        },
        {
            label: 'RS Components',
            icon: '⚙️',
            color: '#e2001a',
            url: `https://sg.rs-online.com/web/c/?searchTerm=${encoded}`,
        },
        {
            label: 'Digi-Key',
            icon: '🔵',
            color: '#005da8',
            url: `https://www.digikey.sg/en/products/result?keywords=${encoded}`,
        },
        {
            label: 'Marine Online',
            icon: '⚓',
            color: '#0a6ebd',
            url: `https://www.marineonline.com/search?keyword=${encoded}`,
        },
    ];
};

// ─── Status UI Helpers ───────────────────────────────────────────────────────

export const STATUS_STYLE = {
    'New':          { bg: '#dbeafe', text: '#1e40af', border: '#bfdbfe', label: 'New Enquiry' },
    'Open':         { bg: '#dbeafe', text: '#1e40af', border: '#bfdbfe', label: 'New Enquiry' },
    'RFQ Floated':  { bg: '#f3e8ff', text: '#6b21a8', border: '#e9d5ff', label: 'RFQ Floated' },
    'Quote Sent':   { bg: '#fef3c7', text: '#92400e', border: '#fde68a', label: 'Quote Sent' },
    'Quoted':       { bg: '#fef3c7', text: '#92400e', border: '#fde68a', label: 'Quoted' },
    'Job Created':  { bg: '#dcfce7', text: '#166534', border: '#bbf7d0', label: 'Job Created' },
    'Closed':       { bg: '#f3f4f6', text: '#374151', border: '#e5e7eb', label: 'Closed' },
    'Cancelled':    { bg: '#ffe4e6', text: '#9f1239', border: '#fecdd3', label: 'Cancelled' },
};

export const getStatusStyle = (status) =>
    STATUS_STYLE[status] || STATUS_STYLE['New'];

export const JOB_STATUS_STYLE = {
    'Draft':     { bg: '#f1f5f9', text: '#475569', border: '#e2e8f0' },
    'Active':    { bg: '#dcfce7', text: '#166534', border: '#bbf7d0' },
    'On Hold':   { bg: '#fef3c7', text: '#92400e', border: '#fde68a' },
    'Completed': { bg: '#eff6ff', text: '#1e40af', border: '#bfdbfe' },
    'Invoiced':  { bg: '#f3e8ff', text: '#6b21a8', border: '#e9d5ff' },
    'Paid':      { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' },
    'Cancelled': { bg: '#ffe4e6', text: '#9f1239', border: '#fecdd3' },
};

export const getJobStatusStyle = (status) =>
    JOB_STATUS_STYLE[status] || JOB_STATUS_STYLE['Active'];

/**
 * Strip HTML tags from rich text description.
 */
export const stripHtml = (html) =>
    (html || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Format a date string to 'DD Mon YY' format.
 */
export const fmtDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: '2-digit'
    });
};

/**
 * Ensures that an enquiry has a dedicated folder in Google Drive
 * with all standard locally numbered subfolders provisioned.
 * Subfolders:
 *   - 01_ENQUIRY_PO_RFQ
 *   - 02_CUSTOMER_QUOTES
 *   - 03_SUPPLIER_QUOTES_PO
 *   - 04_DELIVERY_INVOICE
 *   - Photos & Gallery
 *   - SupportDocs
 *   - SupplierBills&Expenses
 */
export const ensureEnquiryFolderAndSubfolders = async (accessToken, celronRootId, enquiry, forceCreate = false) => {
    const custName = enquiry.customer?.name || enquiry.customer_name || 'Walk-in';
    const cleanName = custName.replace(/[^a-zA-Z0-9\s]/g, '').trim().substring(0, 25);
    const folderName = `${enquiry.enquiry_no || 'ENQ'} - ${cleanName}`;
    const year = new Date(enquiry.enquiry_date || enquiry.created_at || new Date()).getFullYear().toString();

    const { getOrCreateFolder } = await import('./driveService');

    // 1. Year folder under Celron Root
    const yearFolderId = await getOrCreateFolder(accessToken, year, celronRootId);

    // 2. 'Enquiries' folder under Year folder
    const enquiriesRootId = await getOrCreateFolder(accessToken, 'Enquiries', yearFolderId);

    // 3. Enquiry folder
    let enqFolderId = enquiry.gdrive_folder_id;
    if (!enqFolderId || forceCreate) {
        enqFolderId = await getOrCreateFolder(accessToken, folderName, enquiriesRootId);
    }

    // 4. Provision standard locally-numbered subfolders inside the enquiry folder
    const subfolderNames = [
        '01_ENQUIRY_PO_RFQ',
        '02_CUSTOMER_QUOTES',
        '03_SUPPLIER_QUOTES_PO',
        '04_DELIVERY_INVOICE',
        'Photos & Gallery',
        'SupportDocs',
        'SupplierBills&Expenses'
    ];

    const subfolders = {};
    for (const subName of subfolderNames) {
        try {
            subfolders[subName] = await getOrCreateFolder(accessToken, subName, enqFolderId);
        } catch (err) {
            console.warn(`Could not create subfolder ${subName}:`, err);
        }
    }

    // 5. Update supabase if newly created or updated
    if (enquiry.id && (!enquiry.gdrive_folder_id || enquiry.gdrive_folder_id !== enqFolderId)) {
        await supabase
            .from('customer_enquiries')
            .update({
                gdrive_folder_id: enqFolderId,
                gdrive_file_link: `https://drive.google.com/drive/folders/${enqFolderId}`
            })
            .eq('id', enquiry.id);
    }

    return {
        enqFolderId,
        enquiriesRootId,
        webViewLink: `https://drive.google.com/drive/folders/${enqFolderId}`,
        subfolders
    };
};

/**
 * Duplicates an enquiry record in Supabase with a fresh enquiry number.
 */
export const duplicateEnquiry = async (enquiry, companyId) => {
    const { enquiry_no, id, created_at, updated_at, ...rest } = enquiry;
    const { generateEnquiryNo } = await import('./enquiryService');
    const newNo = await generateEnquiryNo(companyId);

    const { data, error } = await supabase
        .from('customer_enquiries')
        .insert([{
            ...rest,
            enquiry_no: newNo,
            status: 'New',
            enquiry_date: new Date().toISOString().split('T')[0],
            gdrive_folder_id: null,
            gdrive_file_link: null,
            customer_id: enquiry.customer?.id || enquiry.customer_id,
            contact_id: enquiry.contact?.id || enquiry.contact_id,
        }])
        .select()
        .single();

    if (error) throw error;
    return data;
};
