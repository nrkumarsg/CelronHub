import { supabase } from './supabase';

const padZero = (num, length) => String(num).padStart(length, '0');

/**
 * Fetch revision history for a document.
 * Filters by original_document_id or document_no pattern.
 */
export const getDocumentHistory = async (doc) => {
    const originalId = doc.original_document_id || doc.id;
    const { data, error } = await supabase
        .from('workflow_documents')
        .select('*')
        .or(`id.eq.${originalId},original_document_id.eq.${originalId}`)
        .order('revision_no', { ascending: false });

    return { data, error };
};

/**
 * Generate Next Document Number
 * Pattern: [PREFIX]-YYYYMM-XXXX
 */
export const generateDocNumber = async (companyId, type, isRevision = false, originalNo = null) => {
    if (isRevision && originalNo) {
        // Pattern: [ORIGINAL]-R[REV_NO]
        const { data: latestRev } = await supabase
            .from('workflow_documents')
            .select('document_no')
            .ilike('document_no', `${originalNo}-R%`)
            .order('document_no', { ascending: false })
            .limit(1);

        if (latestRev && latestRev.length > 0) {
            const lastNo = latestRev[0].document_no;
            const rPart = lastNo.split('-R')[1];
            const nextRev = (parseInt(rPart, 10) || 0) + 1;
            return `${originalNo}-R${nextRev}`;
        }
        return `${originalNo}-R1`;
    }

    const today = new Date();
    const yy = String(today.getFullYear()).slice(2);
    const mm = padZero(today.getMonth() + 1, 2);

    let prefix = 'DOC';
    switch (type) {
        case 'Enquiry': prefix = 'ENQ'; break;
        case 'Quotation': prefix = 'QTN'; break;
        case 'Purchase Order': prefix = 'PO'; break;
        case 'Delivery Order': prefix = 'DO'; break;
        case 'Service Report': prefix = 'SR'; break;
        case 'Certificate': prefix = 'CERT'; break;
        case 'Proforma Invoice': prefix = 'PRO'; break;
        case 'Packing List': prefix = 'PKL'; break;
        case 'Tax Invoice': prefix = 'INV'; break;
        case 'Payment Received': prefix = 'PAY'; break;
        case 'Statement of Account': prefix = 'SOA'; break;
        case 'Job': prefix = 'CEL'; break; // v3 Requirement
        case 'Order Acknowledgment': prefix = 'ORA'; break;
    }

    const fullPrefix = `${prefix}-${yy}${mm}-`;

    // Fetch the latest numbers across all months to find the absolute maximum serial number
    let query = supabase
        .from('workflow_documents')
        .select('document_no')
        .eq('company_id', companyId)
        .ilike('document_no', `${prefix}-%`)
        .not('document_no', 'ilike', '%-R%') // Exclude revisions
        .order('created_at', { ascending: false });

    if (type !== 'Job') {
        query = query.eq('document_type', type)
                     .or('is_job.eq.false,is_job.is.null'); // Only look at standalone document sequences
    }

    const { data, error } = await query;

    let nextNum = 1;
    if (type === 'Job') nextNum = 6051;

    if (data && data.length > 0) {
        let maxNum = 0;
        for (const doc of data) {
            const parts = doc.document_no.split('-');
            const lastPart = parts[parts.length - 1];
            const num = parseInt(lastPart, 10);
            if (!isNaN(num) && num > maxNum) {
                maxNum = num;
            }
        }
        if (maxNum > 0) {
            nextNum = Math.max(nextNum, maxNum + 1);
        }
    }

    // Safety Loop: Ensure the generated number is truly unique
    let finalNo = `${fullPrefix}${padZero(nextNum, 4)}`;
    let isUnique = false;
    let attempts = 0;

    while (!isUnique && attempts < 100) {
        const { data: existing } = await supabase
            .from('workflow_documents')
            .select('id')
            .eq('document_no', finalNo)
            .maybeSingle();
        
        if (!existing) {
            isUnique = true;
        } else {
            nextNum++;
            finalNo = `${fullPrefix}${padZero(nextNum, 4)}`;
            attempts++;
        }
    }

    return finalNo;
};

/**
 * Fetch Documents by Type
 */
export const getWorkflowDocuments = async (companyId, type = null) => {
    let query = supabase
        .from('workflow_documents')
        .select(`*`)
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

    if (type) {
        if (Array.isArray(type)) {
            query = query.in('document_type', type);
        } else {
            query = query.eq('document_type', type);
        }
    }

    const { data, error } = await query;
    if (error) return { data: null, error };

    // Fetch related names manually if needed to avoid relationship join errors
    if (data && data.length > 0) {
        // Fetch partners
        const partnerIds = [...new Set(data.map(d => d.partner_id).filter(Boolean))];
        if (partnerIds.length > 0) {
            // Updated to select * or correct columns to avoid "Walk-in" errors due to schema mismatches (e.g., registration_no vs uen)
            const { data: partners, error: pError } = await supabase.from('partners').select('*').in('id', partnerIds);
            if (pError) console.error("Error fetching partners in getWorkflowDocuments:", pError);
            const partnerMap = Object.fromEntries(partners?.map(p => [p.id, p]) || []);
            data.forEach(d => { d.partners = partnerMap[d.partner_id]; });
        }

        // Fetch vessels
        const vesselIds = [...new Set(data.map(d => d.vessel_id).filter(Boolean))];
        if (vesselIds.length > 0) {
            const { data: vessels } = await supabase.from('vessels').select('id, vessel_name').in('id', vesselIds);
            const vesselMap = Object.fromEntries(vessels?.map(v => [v.id, v]) || []);
            data.forEach(d => { d.vessels = vesselMap[d.vessel_id]; });
        }

        // Fetch work locations
        const locationIds = [...new Set(data.map(d => d.work_location_id).filter(Boolean))];
        if (locationIds.length > 0) {
            const { data: locations } = await supabase.from('work_locations').select('id, location_name').in('id', locationIds);
            const locationMap = Object.fromEntries(locations?.map(l => [l.id, l]) || []);
            data.forEach(d => { d.work_locations = locationMap[d.work_location_id]; });
        }

        // Fetch contacts
        const contactIds = [...new Set(data.map(d => d.contact_id).filter(Boolean))];
        if (contactIds.length > 0) {
            const { data: contacts } = await supabase.from('contacts').select('id, name, email, handphone').in('id', contactIds);
            const contactMap = Object.fromEntries(contacts?.map(c => [c.id, c]) || []);
            data.forEach(d => { d.contacts = contactMap[d.contact_id]; });
        }
    }
    
    return { data, error };
};


/**
 * Fetch Statement of Account Data
 */
export const getStatementData = async (companyId, partnerId, startDate, endDate) => {
    // Fetch all Invoices, Proformas, and Payments for this partner up to endDate
    // We need earlier ones to calculate opening balance correctly
    let query = supabase
        .from('workflow_documents')
        .select('*, partners(name), vessels!vessel_id(vessel_name), work_locations!work_location_id(location_name)')
        .eq('company_id', companyId)
        .in('document_type', ['Tax Invoice', 'Proforma Invoice', 'Payment Received'])
        .lte('issue_date', endDate)
        .order('issue_date', { ascending: true });

    if (partnerId) {
        query = query.eq('partner_id', partnerId);
    }

    const { data, error } = await query;

    if (error) return { data: null, error };

    let partner = null;
    if (partnerId) {
        const { data: pData } = await supabase
            .from('partners')
            .select('*')
            .eq('id', partnerId)
            .single();
        partner = pData;
    }

    return { data, partner, error: null };
};

/**
 * Get Detailed Hub Stats
 */
export const getHubStats = async (companyId) => {
    try {
        const [v1Enquiries, v2Docs, quotes] = await Promise.all([
            supabase.from('customer_enquiries').select('id, status').eq('company_id', companyId),
            supabase.from('workflow_documents').select('id, document_type, total_amount, status').eq('company_id', companyId),
            supabase.from('supplier_quotes').select('id').eq('company_id', companyId)
        ]);

        const stats = {
            activeEnquiries: v1Enquiries.data?.filter(e => !['Job Created', 'Cancelled'].includes(e.status)).length || 0,
            pendingRFQs: v2Docs.data?.filter(d => d.document_type === 'Enquiry' && d.status === 'Draft').length || 0,
            receivedQuotes: quotes.data?.length || 0,
            totalPOValue: v2Docs.data?.filter(d => d.document_type === 'Purchase Order').reduce((sum, d) => sum + (parseFloat(d.total_amount) || 0), 0) || 0
        };

        return stats;
    } catch (err) {
        console.error("Error fetching hub stats:", err);
        return { activeEnquiries: 0, pendingRFQs: 0, receivedQuotes: 0, totalPOValue: 0 };
    }
};

/**
 * Get RFQ and Quote counts for a specific enquiry
 */
export const getEnquiryLinkedStats = async (enquiryId) => {
    try {
        const [rfqs, quotes] = await Promise.all([
            supabase.from('workflow_documents').select('id').eq('enquiry_id', enquiryId).eq('document_type', 'Enquiry'),
            supabase.from('supplier_quotes').select('id').eq('enquiry_id', enquiryId)
        ]);
        return {
            rfqCount: rfqs.data?.length || 0,
            quoteCount: quotes.data?.length || 0
        };
    } catch (err) {
        return { rfqCount: 0, quoteCount: 0 };
    }
};

/**
 * Track that an enquiry has been floated to specific suppliers
 */
export const trackFloatedRFQ = async (enquiryId, supplierIds, companyId) => {
    // Update enquiry status to reflect it has been floated
    const { error } = await supabase
        .from('customer_enquiries')
        .update({ 
            status: 'RFQ Floated',
            updated_at: new Date().toISOString()
        })
        .eq('id', enquiryId);
    
    if (error) console.error("Error updating enquiry status:", error);
    
    return { success: !error };
};

/**
 * Fetch Documents linked to a Job
 */
export const getWorkflowDocumentsByJob = async (jobId) => {
    const { data, error } = await supabase
        .from('workflow_documents')
        .select(`*, partners(name), vessels!vessel_id(vessel_name), work_locations!work_location_id(location_name)`)
        .or(`job_id.eq.${jobId},id.eq.${jobId}`)
        .order('created_at', { ascending: false });
    return { data, error };
};

/**
 * Fetch Documents linked to an Enquiry
 */
export const getWorkflowDocumentsByEnquiry = async (enquiryId) => {
    const { data, error } = await supabase
        .from('workflow_documents')
        .select(`*, partners(name), vessels!vessel_id(vessel_name), work_locations!work_location_id(location_name)`)
        .eq('enquiry_id', enquiryId)
        .order('created_at', { ascending: false });
    return { data, error };
};

/**
 * Fetch Single Document with All Line Items
 */
export const getWorkflowDocumentById = async (id) => {
    const { data: document, error: docError } = await supabase
        .from('workflow_documents')
        .select(`*, partners(*), vessels(*), contacts!contact_id(*), work_locations(*)`)
        .eq('id', id)
        .single();

    if (docError) {
        console.error("Error fetching document:", docError);
        return { error: docError };
    }

    const { data: items, error: itemsError } = await supabase
        .from('workflow_line_items')
        .select('*')
        .eq('document_id', id)
        .order('sort_order', { ascending: true });

    // Deduplicate items to fix legacy database repeats
    const rawItems = items || [];
    const uniqueItems = [];
    const seen = new Set();
    
    rawItems.forEach(item => {
        const desc = (item.description || '').trim();
        const details = (item.details || '').trim();
        const qty = parseFloat(item.quantity) || 0;
        const price = parseFloat(item.unit_price) || 0;
        const isSec = !!item.is_section;
        const isNote = !!item.is_note;

        const key = `${desc}|${details}|${qty}|${price}|${isSec}|${isNote}`;
        
        if (!seen.has(key)) {
            uniqueItems.push(item);
            seen.add(key);
        }
    });

    // Unnest salesperson details from delivery_verification if they exist
    if (document.delivery_verification) {
        if (document.delivery_verification.salesperson_phone) document.salesperson_phone = document.delivery_verification.salesperson_phone;
        if (document.delivery_verification.salesperson_email) document.salesperson_email = document.delivery_verification.salesperson_email;
    }

    return { data: { ...document, items: uniqueItems }, error: itemsError };
};

/**
 * Delete Document and its Line Items
 */
export const deleteWorkflowDocument = async (id) => {
    try {
        // 1. Check for dependent documents (revisions that point to this as original)
        const { data: dependents } = await supabase
            .from('workflow_documents')
            .select('id, document_no')
            .eq('original_document_id', id);

        if (dependents && dependents.length > 0) {
            // Delete dependent revisions first
            for (const dep of dependents) {
                await deleteWorkflowDocument(dep.id);
            }
        }

        // 2. Delete line items
        const { error: itemError } = await supabase.from('workflow_line_items').delete().eq('document_id', id);
        if (itemError) {
            console.error("Error deleting items for document:", id, itemError);
            // We continue as it might be a partial delete or empty items
        }

        // 3. Delete the document itself
        const { error: docError } = await supabase.from('workflow_documents').delete().eq('id', id);
        
        if (docError) {
            console.error("Supabase delete error:", docError);
            return { error: docError };
        }

        return { error: null };
    } catch (err) {
        console.error("Caught error in deleteWorkflowDocument:", err);
        return { error: err };
    }
};

/**
 * Save Document (Create or Update) + Sync Line Items
 */
export const saveWorkflowDocument = async (docData, lineItems) => {
    const { items, partners, contacts, vessels, work_locations, ...headerData } = docData;
    const isNew = !headerData.id;

    // Sanitize Document Header
    const validDocKeys = [
        'id', 'company_id', 'document_type', 'document_no', 'issue_date', 'expiry_date',
        'partner_id', 'contact_id', 'vessel_id', 'work_location_id',
        'salesperson_name', 'subject', 'customer_ref', 'currency', 'exchange_rate',
        'terms_conditions', 'notes', 'status', 'subtotal', 'tax_amount', 'total_amount',
        'internal_notes',
        'discount_amount', 'discount_percent',
        'customer_po_no', 'customer_po_date', 'customer_po_by_id', 'customer_po_attachment_url',
        'is_job', 'assigned_job_no', 'payment_terms',
        'original_document_id', 'revision_no', 'enquiry_id', 'job_id',
        'attachment_urls', 'delivery_verification', 'gdrive_folder_id', 'drive_folder_id',
        'signature_url', 'signed_by', 'is_signed'
    ];

    const sanitizedHeader = {};
    validDocKeys.forEach(key => {
        if (headerData[key] !== undefined) sanitizedHeader[key] = headerData[key];
    });

    // Nest salesperson details into delivery_verification if they exist at top level
    if (headerData.salesperson_phone || headerData.salesperson_email) {
        sanitizedHeader.delivery_verification = {
            ...(sanitizedHeader.delivery_verification || {}),
            salesperson_phone: headerData.salesperson_phone,
            salesperson_email: headerData.salesperson_email
        };
    }

    // Clean UUID fields (ensure null if empty/invalid)
    const uuidFields = [
        'company_id', 'partner_id', 'contact_id', 'vessel_id', 'work_location_id',
        'customer_po_by_id', 'original_document_id', 'enquiry_id', 'job_id'
    ];
    uuidFields.forEach(f => {
        if (sanitizedHeader[f] === '') sanitizedHeader[f] = null;
        else if (!sanitizedHeader[f]) sanitizedHeader[f] = null;
    });

    // Handle ID separately: if it's empty or null for a new record, delete it so DB can generate it
    if (!sanitizedHeader.id || sanitizedHeader.id === '') {
        delete sanitizedHeader.id;
    }

    // Clean Date fields (ensure null if empty)
    const dateFields = ['issue_date', 'expiry_date', 'customer_po_date'];
    dateFields.forEach(f => {
        if (sanitizedHeader[f] === '') sanitizedHeader[f] = null;
    });

    // Ensure numeric fields are actually numbers
    sanitizedHeader.subtotal = parseFloat(sanitizedHeader.subtotal) || 0;
    sanitizedHeader.tax_amount = parseFloat(sanitizedHeader.tax_amount) || 0;
    sanitizedHeader.total_amount = parseFloat(sanitizedHeader.total_amount) || 0;
    sanitizedHeader.exchange_rate = parseFloat(sanitizedHeader.exchange_rate) || 1.0;

    // Sync assigned_job_no for Job documents
    if (sanitizedHeader.document_type === 'Job') {
        sanitizedHeader.assigned_job_no = sanitizedHeader.document_no;
    }

    let oldJobNo = null;
    if (!isNew && sanitizedHeader.document_type === 'Job') {
        try {
            const { data: existingDoc } = await supabase
                .from('workflow_documents')
                .select('document_no')
                .eq('id', headerData.id)
                .single();
            if (existingDoc) {
                oldJobNo = existingDoc.document_no;
            }
        } catch (err) {
            console.error("Failed to fetch existing job document for renaming:", err);
        }
    }

    let savedDoc;
    if (isNew) {
        // Double check document_no is set
        if (!sanitizedHeader.document_no) {
            throw new Error("Document number is required for saving.");
        }

        const { data, error } = await supabase
            .from('workflow_documents')
            .insert([sanitizedHeader])
            .select()
            .single();
        if (error) throw error;
        savedDoc = data;
    } else {
        const { data, error } = await supabase
            .from('workflow_documents')
            .update(sanitizedHeader)
            .eq('id', headerData.id)
            .select()
            .single();
        if (error) throw error;
        savedDoc = data;

        if (oldJobNo && oldJobNo !== savedDoc.document_no) {
            try {
                const oldSuffix = oldJobNo.includes('-') ? oldJobNo.substring(oldJobNo.indexOf('-') + 1) : oldJobNo;
                const newSuffix = savedDoc.document_no.includes('-') ? savedDoc.document_no.substring(savedDoc.document_no.indexOf('-') + 1) : savedDoc.document_no;

                // 1. Fetch all associated documents
                const { data: suiteDocs } = await supabase
                    .from('workflow_documents')
                    .select('id, document_no')
                    .eq('assigned_job_no', oldJobNo);

                if (suiteDocs && suiteDocs.length > 0) {
                    for (const doc of suiteDocs) {
                        const newDocNo = doc.document_no.replace(oldSuffix, newSuffix);
                        await supabase
                            .from('workflow_documents')
                            .update({ 
                                document_no: newDocNo,
                                assigned_job_no: savedDoc.document_no 
                            })
                            .eq('id', doc.id);
                    }
                }

                // 2. Propagate to legacy jobs table
                await supabase
                    .from('jobs')
                    .update({ job_no: savedDoc.document_no })
                    .eq('job_no', oldJobNo);
                    
                console.log(`Successfully renamed job suite and propagated from ${oldJobNo} to ${savedDoc.document_no}`);
            } catch (propErr) {
                console.error("Failed to propagate job rename:", propErr);
            }
        }
    }

    // Handle Line Items
    if (lineItems && lineItems.length >= 0) {
        if (!isNew) {
            await supabase.from('workflow_line_items').delete().eq('document_id', savedDoc.id);
        }

        // Deduplicate items before saving
        const uniqueItems = [];
        const seen = new Set();
        
        // Filter out completely empty items that aren't sections/notes
        const itemsToProcess = lineItems.filter(it => (it.description && it.description.trim()) || it.is_section || it.is_note);

        itemsToProcess.forEach(item => {
            const desc = (item.description || '').trim();
            const details = (item.details || '').trim();
            const qty = parseFloat(item.quantity) || 0;
            const price = parseFloat(item.unit_price) || 0;
            const isSec = !!item.is_section;
            const isNote = !!item.is_note;

            const key = `${desc}|${details}|${qty}|${price}|${isSec}|${isNote}`;
            
            if (!seen.has(key)) {
                uniqueItems.push({
                    document_id: savedDoc.id,
                    item_id: item.item_id || null,
                    description: desc,
                    details: details,
                    quantity: qty,
                    unit_price: price,
                    uom: item.uom || 'UNIT(S)',
                    amount: qty * price,
                    sort_order: uniqueItems.length,
                    tax_rate: parseFloat(item.tax_rate ?? 9) || 0,
                    tax_enabled: item.tax_enabled !== false,
                    is_section: isSec,
                    is_note: isNote
                });
                seen.add(key);
            }
        });

        if (uniqueItems.length > 0) {
            const { error: itemError } = await supabase
                .from('workflow_line_items')
                .insert(uniqueItems);
            if (itemError) throw itemError;
        }
    }

    return { data: savedDoc, error: null };
};

/**
 * Upload Job Attachment to Supabase Storage
 */
export const uploadJobAttachment = async (file, companyId) => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${companyId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `jobs/${fileName}`;

    const { data, error } = await supabase.storage
        .from('workflow-attachments')
        .upload(filePath, file);

    if (error) {
        console.error("Upload error:", error);
        throw error;
    }

    const { data: { publicUrl } } = supabase.storage
        .from('workflow-attachments')
        .getPublicUrl(filePath);

    return publicUrl;
};

/**
 * Helper: Map V1 Enquiry to V2 Document Header
 */
const mapEnquiryToV2Header = (enq, nextNo, targetType = 'Quotation') => ({
    company_id: enq.company_id,
    document_type: targetType,
    document_no: nextNo,
    partner_id: enq.customer_id,
    contact_id: enq.contact_id,
    vessel_id: enq.vessel_id,
    work_location_id: enq.work_location_id,
    subject: enq.subject || `Ref: ${enq.enquiry_no}`,
    customer_ref: enq.customer_ref,
    status: 'Draft',
    currency: 'SGD',
    enquiry_id: enq.id
});

/**
 * Helper: Map Catalog Item to Workflow Line Item
 */
const mapCatalogItemToLineItem = (item, docId, index) => ({
    document_id: docId,
    item_id: item.id,
    description: item.name,
    details: item.specification || '',
    quantity: 1,
    unit_price: item.selling_price || 0,
    uom: 'UNIT(S)',
    amount: item.selling_price || 0,
    sort_order: index,
    tax_rate: 9,
    tax_enabled: true
});

/**
 * Convert V1 Enquiry -> V2 Document (Quotation)
 */
export const convertEnquiryToV2Document = async (enquiryId, targetType = 'Quotation') => {
    // 1. Fetch the V1 Enquiry
    const { data: enq, error: enqError } = await supabase
        .from('customer_enquiries')
        .select('*')
        .eq('id', enquiryId)
        .single();
    if (enqError) throw enqError;

    // 2. Generate Next Number for Target Type
    const nextNo = await generateDocNumber(enq.company_id, targetType);

    // 3. Prepare Header
    const docData = mapEnquiryToV2Header(enq, nextNo, targetType);

    // 4. Save Header
    const { data: savedDoc, error: saveError } = await supabase
        .from('workflow_documents')
        .insert([docData])
        .select()
        .single();
    if (saveError) throw saveError;

    // 5. Handle Line Items (if any)
    const v1Items = enq.catalog_items || [];
    if (v1Items.length > 0) {
        const itemsToInsert = v1Items.map((item, index) => mapCatalogItemToLineItem(item, savedDoc.id, index));

        const { error: itemError } = await supabase
            .from('workflow_line_items')
            .insert(itemsToInsert);
        if (itemError) throw itemError;
    }

    return savedDoc;
};

/**
 * Convert Shortlisted Supplier Quote -> V2 Document (Quotation for Customer)
 */
export const createQuotationFromSupplierQuote = async (quoteId) => {
    // 1. Fetch the Supplier Quote with Enquiry info
    const { data: quote, error: quoteError } = await supabase
        .from('supplier_quotes')
        .select(`*, enquiries:customer_enquiries(*)`)
        .eq('id', quoteId)
        .single();
    if (quoteError) throw quoteError;

    const enq = quote.enquiries;
    if (!enq) throw new Error("Linked enquiry not found");

    // 2. Generate Next Number for QTN
    const nextNo = await generateDocNumber(enq.company_id, 'Quotation');

    // 3. Prepare Header
    const docData = {
        company_id: enq.company_id,
        document_type: 'Quotation',
        document_no: nextNo,
        partner_id: enq.customer_id,
        contact_id: enq.contact_id,
        subject: `Ref: ${enq.enquiry_no} | Quotation based on Supplier Bid`,
        customer_ref: enq.customer_ref,
        status: 'Draft',
        currency: 'SGD',
        subtotal: quote.quote_amount || 0,
        total_amount: (quote.quote_amount || 0) * 1.09 // Add GST 9% by default
    };

    // 4. Save Header
    const { data: savedDoc, error: saveError } = await supabase
        .from('workflow_documents')
        .insert([docData])
        .select()
        .single();
    if (saveError) throw saveError;

    // 5. Handle Line Items (Map items from enquiry with supplier pricing)
    const v1Items = enq.catalog_items || [];
    if (v1Items.length > 0) {
        // Average the supplier price across items for simplicity in demo
        const avgPrice = (quote.quote_amount || 0) / v1Items.length;

        const itemsToInsert = v1Items.map((item, index) => ({
            document_id: savedDoc.id,
            item_id: item.id,
            description: item.name,
            details: item.specification || '',
            quantity: 1,
            unit_price: avgPrice,
            uom: 'UNIT(S)',
            amount: avgPrice,
            sort_order: index,
            tax_rate: 9,
            tax_enabled: true
        }));

        const { error: itemError } = await supabase
            .from('workflow_line_items')
            .insert(itemsToInsert);
        if (itemError) throw itemError;
    }

    return savedDoc;
};

/**
 * Convert Shortlisted Supplier Quote -> V2 Document (Purchase Order to Supplier)
 */
export const createSupplierPOFromSupplierQuote = async (quoteId) => {
    // 1. Fetch the Supplier Quote with Enquiry info
    const { data: quote, error: quoteError } = await supabase
        .from('supplier_quotes')
        .select(`*, enquiries:customer_enquiries(*)`)
        .eq('id', quoteId)
        .single();
    if (quoteError) throw quoteError;

    const enq = quote.enquiries;
    if (!enq) throw new Error("Linked enquiry not found");

    // 2. Generate Next Number for PO
    const nextNo = await generateDocNumber(enq.company_id, 'Purchase Order');

    // 3. Prepare Header
    const docData = {
        company_id: enq.company_id,
        document_type: 'Purchase Order',
        document_no: nextNo,
        partner_id: quote.supplier_id, // Important: Partner is the Supplier
        subject: `Order for: ${enq.enquiry_no} | ${enq.subject || ''}`,
        customer_ref: enq.customer_ref,
        status: 'Draft',
        currency: 'SGD',
        subtotal: quote.quote_amount || 0,
        total_amount: (quote.quote_amount || 0), // POs usually don't have GST added by us, but by supplier. Let's keep subtotal for now.
        enquiry_id: enq.id,
        vessel_id: enq.vessel_id,
        work_location_id: enq.work_location_id
    };

    // 4. Save Header
    const { data: savedDoc, error: saveError } = await supabase
        .from('workflow_documents')
        .insert([docData])
        .select()
        .single();
    if (saveError) throw saveError;

    // 5. Handle Line Items (Map items from enquiry with supplier pricing)
    const items = enq.catalog_items || [];
    if (items.length > 0) {
        // Average the supplier price across items if we can't map them 1:1
        const avgPrice = (quote.quote_amount || 0) / items.length;

        const itemsToInsert = items.map((item, index) => ({
            document_id: savedDoc.id,
            item_id: item.id || item.item_id || null,
            description: item.name || item.description,
            details: item.specification || item.details || '',
            quantity: item.qty || item.quantity || 1,
            unit_price: avgPrice,
            uom: item.unit || item.uom || 'UNIT(S)',
            amount: avgPrice * (item.qty || item.quantity || 1),
            sort_order: index,
            tax_rate: 0, // PO tax handled by supplier
            tax_enabled: false
        }));

        const { error: itemError } = await supabase
            .from('workflow_line_items')
            .insert(itemsToInsert);
        if (itemError) throw itemError;
    }

    return savedDoc;
};

/**
 * Create a Revision of an existing Document
 */
export const createDocumentRevision = async (docId) => {
    const { data: original, error: fetchErr } = await getWorkflowDocumentById(docId);
    if (fetchErr) throw fetchErr;

    const { items, id, created_at, updated_at, ...cleanHeader } = original;

    // 1. Mark original as Superseded (optional UI logic, but let's keep it active for history)
    // 2. Generate New Revision Number
    const revNo = await generateDocNumber(original.company_id, original.document_type, true, original.document_no);

    const newDocData = {
        ...cleanHeader,
        document_no: revNo,
        original_document_id: original.original_document_id || original.id,
        revision_no: (original.revision_no || 0) + 1,
        status: 'Draft',
        is_job: false,
        assigned_job_no: null,
        customer_po_no: null,
        customer_po_date: null,
        customer_po_by_id: null,
        customer_po_attachment_url: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    return await saveWorkflowDocument(newDocData, items);
};

/**
 * Duplicate a Document (Creates a brand new copy with a new number)
 */
export const duplicateWorkflowDocument = async (docId, overrides = {}) => {
    const { data: original, error: fetchErr } = await getWorkflowDocumentById(docId);
    if (fetchErr) throw fetchErr;

    const { items, id, created_at, updated_at, original_document_id, revision_no, document_no, ...cleanHeader } = original;

    // Generate new Document Number
    const targetType = overrides.document_type || original.document_type;
    const newNo = await generateDocNumber(original.company_id, targetType);

    const newDocData = {
        ...cleanHeader,
        document_no: newNo,
        status: 'Draft', // Reset status for the duplicated document
        is_job: false,
        assigned_job_no: null,
        customer_po_no: null,
        customer_po_date: null,
        customer_po_by_id: null,
        customer_po_attachment_url: null,
        drive_folder_id: null,
        gdrive_folder_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...overrides
    };

    // Clean up items for the new document (remove old IDs)
    const cleanItems = items.map(item => {
        const { id, document_id, created_at, ...cleanItem } = item;
        return cleanItem;
    });

    return await saveWorkflowDocument(newDocData, cleanItems);
};

/**
 * Convert Quotation to Active Job (v3)
 */
/**
 * Convert Quotation to Active Job (v3)
 * Automatically creates: ORA, DO, PRO, INV, PKL, and optionally CERT/SR
 */
export const convertQuotationToJob = async (quotationId, poData, options = {}) => {
    // 1. Fetch source quotation with items
    const { data: qtn, error: qtnErr } = await getWorkflowDocumentById(quotationId);
    if (qtnErr) throw qtnErr;
    if (qtn.is_job) throw new Error("This quotation has already been converted to a job.");

    // 2. Find Next Available Suite Number (Ensure all prefixes are free)
    let baseJobNo = await generateDocNumber(qtn.company_id, 'Job');
    let seqPart = baseJobNo.split('-').slice(1).join('-'); // YYMM-XXXX
    
    const prefixes = ['CEL', 'ORA', 'DO', 'PRO', 'INV', 'PKL', 'CERT', 'SR'];
    let attempts = 0;
    while (attempts < 20) {
        const targetNos = prefixes.map(p => `${p}-${seqPart}`);
        const { data: existing } = await supabase
            .from('workflow_documents')
            .select('document_no')
            .in('document_no', targetNos);
            
        if (!existing || existing.length === 0) break;
        
        // If any taken, increment the number part
        const parts = seqPart.split('-');
        const yyMM = parts[0];
        const num = parseInt(parts[1]);
        seqPart = `${yyMM}-${padZero(num + 1, 4)}`;
        attempts++;
    }
    
    const jobNo = `CEL-${seqPart}`;

    // 3. Update Original Quotation
    const qtnUpdate = {
        ...qtn,
        is_job: true,
        assigned_job_no: jobNo,
        status: 'Confirmed',
        customer_po_no: poData.po_no,
        customer_po_date: poData.po_date,
        customer_po_by_id: poData.contact_id || qtn.contact_id,
        customer_po_attachment_url: poData.attachment_url,
        delivery_verification: {
            ...(qtn.delivery_verification || {}),
            po_description: poData.po_description,
            po_value: poData.po_value
        }
    };
    await saveWorkflowDocument(qtnUpdate, qtn.items);

    // 4. Batch Generate Master Job Record
    // (Previously this loop generated ORA, DO, PRO, INV, etc. Now it only generates the Job master)
    const docTypes = [
        { type: 'Job', prefix: 'CEL' } // Master Job Record
    ];

    for (const doc of docTypes) {
        const newDocData = {
            ...qtn,
            id: undefined, // Force insert
            document_type: doc.type,
            document_no: `${doc.prefix}-${seqPart}`,
            assigned_job_no: jobNo,
            is_job: true,
            status: 'Draft',
            issue_date: new Date().toISOString().split('T')[0],
            customer_po_no: poData.po_no,
            customer_po_date: poData.po_date,
            customer_po_by_id: poData.contact_id || qtn.contact_id,
            customer_po_attachment_url: poData.attachment_url,
            delivery_verification: qtnUpdate.delivery_verification
        };
        
        await saveWorkflowDocument(newDocData, qtn.items);
    }

    return { jobNo };
};

/**
 * Revert a Job back to a Quotation
 * Clears job status and unlinks associated documents
 */
export const revertJobToQuotation = async (jobNo) => {
    // 1. Find all documents associated with this job number
    const { data: docs, error: fetchErr } = await supabase
        .from('workflow_documents')
        .select('id, document_type, document_no')
        .eq('assigned_job_no', jobNo);
    
    if (fetchErr) throw fetchErr;

    // 2. Identify the original Quotation and the derived documents
    // We look for QTN prefix. If not found, we might look for the earliest doc or just error.
    const quotation = docs.find(d => (d.document_no || '').startsWith('QTN'));
    const derivedIds = docs.filter(d => d.id !== quotation?.id).map(d => d.id);

    // 3. Reset the Quotation
    if (quotation) {
        await supabase
            .from('workflow_documents')
            .update({
                is_job: false,
                assigned_job_no: null,
                status: 'Draft',
                customer_po_no: null,
                customer_po_date: null,
                customer_po_by_id: null
            })
            .eq('id', quotation.id);
    }

    // 4. Delete derived documents (CEL/Job, ORA, DO, INV, etc.)
    if (derivedIds.length > 0) {
        // First delete their items
        await supabase.from('workflow_line_items').delete().in('document_id', derivedIds);
        // Then delete the documents
        await supabase.from('workflow_documents').delete().in('id', derivedIds);
    }

    return { success: true };
};

/**
 * Revert a Quotation back to an Enquiry
 */
export const revertQuotationToEnquiry = async (quotationId) => {
    const { data: qtn, error: qtnErr } = await getWorkflowDocumentById(quotationId);
    if (qtnErr) throw qtnErr;

    // 1. Generate new Enquiry Number
    const enqNo = await generateDocNumber(qtn.company_id, 'Enquiry');
    
    // 2. Prepare Enquiry Header
    const { items, id, created_at, updated_at, document_no, document_type, ...cleanHeader } = qtn;
    const newEnqData = {
        ...cleanHeader,
        document_type: 'Enquiry',
        document_no: enqNo,
        status: 'Draft',
        issue_date: new Date().toISOString().split('T')[0]
    };

    // 3. Save new Enquiry
    const { data: savedEnq, error: saveError } = await saveWorkflowDocument(newEnqData, items);
    if (saveError) throw saveError;

    // 4. Delete original Quotation
    await supabase.from('workflow_line_items').delete().eq('document_id', quotationId);
    await supabase.from('workflow_documents').delete().eq('id', quotationId);

    return savedEnq;
};

/**
 * Convert a Standalone Invoice to a Job Suite
 */
export const convertInvoiceToJob = async (invoiceId, poData = {}) => {
    const { data: inv, error: invErr } = await getWorkflowDocumentById(invoiceId);
    if (invErr) throw invErr;

    // 1. Generate Job Number Suite (CEL-YYMM-XXXX) with prefix checks
    let baseJobNo = await generateDocNumber(inv.company_id, 'Job');
    let seqPart = baseJobNo.split('-').slice(1).join('-'); // YYMM-XXXX
    
    const prefixes = ['CEL', 'ORA', 'DO', 'PRO', 'INV', 'PKL', 'CERT', 'SR'];
    let attempts = 0;
    while (attempts < 20) {
        const targetNos = prefixes.map(p => `${p}-${seqPart}`);
        const { data: existing } = await supabase
            .from('workflow_documents')
            .select('document_no')
            .in('document_no', targetNos);
            
        if (!existing || existing.length === 0) break;
        
        // If any taken, increment the number part
        const parts = seqPart.split('-');
        const yyMM = parts[0];
        const num = parseInt(parts[1]);
        seqPart = `${yyMM}-${padZero(num + 1, 4)}`;
        attempts++;
    }

    const jobNo = `CEL-${seqPart}`;

    // 2. Update Original Invoice to be part of the Job
    const invUpdate = {
        ...inv,
        is_job: true,
        assigned_job_no: jobNo,
        status: 'Confirmed',
        customer_po_no: poData.po_no || inv.customer_ref || 'PENDING',
        customer_po_date: poData.po_date || new Date().toISOString().split('T')[0]
    };
    await saveWorkflowDocument(invUpdate, inv.items);

    // 3. Create Master Job Record (CEL)
    const newJobData = {
        ...inv,
        id: undefined,
        document_type: 'Job',
        document_no: jobNo,
        assigned_job_no: jobNo,
        is_job: true,
        status: 'Draft',
        customer_po_no: invUpdate.customer_po_no,
        customer_po_date: invUpdate.customer_po_date
    };
    await saveWorkflowDocument(newJobData, inv.items);

    return { jobNo };
};

/**
 * GDrive Folder Mapping Logic (v3)
 * Under Option B, all documents go to the root project folder, so this returns null.
 */
export const getGDriveFolderIdForStage = (stage) => {
    return null;
};

/**
 * Submit Mobile Proof of Delivery (v3)
 */
export const submitDeliveryProof = async (docId, proofData) => {
    const { signature_url, photos, gps, device_id } = proofData;

    const { data, error } = await supabase
        .from('workflow_documents')
        .update({
            customer_signature_url: signature_url,
            delivery_verification: {
                gps,
                device_id,
                network_timestamp: new Date().toISOString(),
                photos
            },
            status: 'Delivered'
        })
        .eq('id', docId)
        .select()
        .single();

    return { data, error };
};

/**
 * Record External Document (Service Report, Certificate, etc. from Drive)
 */
export const recordExternalDocument = async (docData) => {
    const { data, error } = await supabase
        .from('workflow_documents')
        .insert([docData])
        .select()
        .single();
    return { data, error };
};

/**
 * Convert Proforma Invoice to Tax Invoice
 */
export const convertProformaToTaxInvoice = async (proformaId) => {
    // 1. Fetch source proforma with items
    const { data: pro, error: proErr } = await getWorkflowDocumentById(proformaId);
    if (proErr) throw proErr;

    // 2. Generate Next Tax Invoice Number
    const invNo = await generateDocNumber(pro.company_id, 'Tax Invoice');

    // 3. Prepare New Tax Invoice Header
    const { id, created_at, updated_at, document_no, document_type, ...cleanHeader } = pro;
    const newInvData = {
        ...cleanHeader,
        document_type: 'Tax Invoice',
        document_no: invNo,
        status: 'Draft',
        issue_date: new Date().toISOString().split('T')[0]
    };

    // 4. Save New Document
    const { data: savedInv, error: saveError } = await saveWorkflowDocument(newInvData, pro.items);
    if (saveError) throw saveError;

    return savedInv;
};

/**
 * Get Document Counts and Summary for Dashboards
 */
export const getWorkflowCounts = async (companyId) => {
    try {
        const { data: all, error } = await supabase
            .from('workflow_documents')
            .select('document_type, status')
            .eq('company_id', companyId);

        if (error) throw error;

        const jobCount = all.filter(d => d.document_type === 'Job' && d.status === 'Active').length;

        return { all: all || [], jobCount };
    } catch (err) {
        console.error("Error fetching workflow counts:", err);
        return { all: [], jobCount: 0 };
    }
};

