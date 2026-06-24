/**
 * ============================================================
 *  Enquiry Email Service
 *  Builds pre-filled mailto: triggers and WhatsApp links for:
 *    - RFQ to suppliers (from enquiry@celron.net)
 *    - Quotation to customer
 *  Compatible with Celron's existing mailto-based email flow.
 * ============================================================
 */

const FROM_EMAIL = 'enquiry@celron.net';
const BCC_EMAILS = 'celron.simlim0305@gmail.com,accounts@celron.net';

// ─── Helpers ───────────────────────────────────────────────────────────────────

const stripHtml = (html = '') =>
    html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

const fmtDate = (d) => {
    if (!d) return 'ASAP';
    return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const buildItemsText = (enquiry) => {
    const items = enquiry?.catalog_items || enquiry?.enquiry_lines || [];
    if (items.length === 0) {
        return stripHtml(enquiry?.description || enquiry?.subject || 'As per enquiry');
    }
    return items
        .filter(it => !it.is_section && !it.is_note)
        .map((it, idx) => {
            const name = it.name || it.description || '';
            const spec = it.specification || it.details || it.spec || '';
            const qty = it.qty || it.quantity || '1';
            const uom = it.uom || it.unit || 'pcs';
            return `${idx + 1}. ${name}${spec ? ` — ${spec}` : ''} [Qty: ${qty} ${uom}]`;
        })
        .join('\n');
};

// ─── RFQ Email Builder (Supplier) ─────────────────────────────────────────────

/**
 * Build a pre-filled mailto: URL to float an RFQ to a supplier.
 * @param {Object} enquiry - The enquiry record
 * @param {Object} supplier - The supplier partner record { name, email1, phone1 }
 * @param {string[]} attachmentNotes - Array of file names to mention in body
 * @returns {string} mailto: URL
 */
export const buildRFQMailtoUrl = (enquiry, supplier, attachmentNotes = []) => {
    const enqNo = enquiry?.enquiry_no || '';
    const custRef = enquiry?.customer_ref || '';
    const vessel = enquiry?.vessel || enquiry?.vessel_name || '';
    const dueDate = fmtDate(enquiry?.due_date);
    const itemsList = buildItemsText(enquiry);

    const attLine = attachmentNotes.length > 0
        ? `\n\nAttachments / Files:\n${attachmentNotes.map(f => `  - ${f}`).join('\n')}\n[Files shared via Google Drive folder link upon request]`
        : '';

    const subject = [
        `RFQ: ${enqNo}`,
        custRef && `Ref: ${custRef}`,
        vessel && vessel,
    ].filter(Boolean).join(' | ');

    const body = [
        `Dear ${supplier?.name || 'Supplier'},`,
        '',
        'Please find our Request for Quotation (RFQ) as detailed below.',
        '',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        `RFQ Ref     : ${enqNo}`,
        custRef ? `Cust. Ref   : ${custRef}` : null,
        vessel  ? `Vessel/Loc  : ${vessel}` : null,
        `Required By : ${dueDate}`,
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        '',
        'Items Required:',
        itemsList,
        '',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        'Please provide:',
        '  ✓ Unit Price & Total Price (SGD or your currency)',
        '  ✓ Lead Time / Delivery Date',
        '  ✓ Part Numbers & Brand (if applicable)',
        '  ✓ Technical specifications or alternatives',
        attLine,
        '',
        `Kindly reply to: ${FROM_EMAIL}`,
        '',
        'Best Regards,',
        'Celron Marine & Engineering Pte Ltd',
        `${FROM_EMAIL} | +65 9768 5891`,
        'www.celron.net',
    ].filter(line => line !== null).join('\n');

    const toEmail = supplier?.email1 || supplier?.email || '';
    if (!toEmail) return null;

    return `mailto:${toEmail}?from=${encodeURIComponent(FROM_EMAIL)}&bcc=${encodeURIComponent(BCC_EMAILS)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
};

/**
 * Build a WhatsApp message URL for an RFQ
 */
export const buildRFQWhatsAppUrl = (enquiry, supplier) => {
    const phone = (supplier?.phone1 || supplier?.phone || '').replace(/[^0-9]/g, '');
    if (!phone) return null;

    const enqNo = enquiry?.enquiry_no || '';
    const itemsList = buildItemsText(enquiry);
    const dueDate = fmtDate(enquiry?.due_date);

    const msg = [
        `*RFQ: ${enqNo}*`,
        enquiry?.customer_ref ? `Ref: ${enquiry.customer_ref}` : null,
        enquiry?.vessel || enquiry?.vessel_name ? `Vessel/Loc: ${enquiry.vessel || enquiry.vessel_name}` : null,
        `Required By: ${dueDate}`,
        '',
        '*Items Required:*',
        itemsList,
        '',
        'Kindly quote your best price, lead time, and brand.',
        `Reply to: ${FROM_EMAIL}`,
        '',
        '_Celron Marine & Engineering_',
    ].filter(Boolean).join('\n');

    return `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(msg)}`;
};

// ─── Quotation Email Builder (Customer) ───────────────────────────────────────

/**
 * Build a pre-filled mailto: URL to send a Quotation to a customer.
 * Used after a WorkflowEditor Quotation is generated.
 * 
 * @param {Object} doc      - The workflow_document record (Quotation)
 * @param {Object} customer - The partner record for the customer
 * @param {Object} settings - Company settings { company_name, email, phone, website }
 * @param {string} pdfUrl   - Google Drive link to the saved PDF (optional)
 * @returns {string} mailto: URL
 */
export const buildQuotationMailtoUrl = (doc, customer, settings = {}, pdfUrl = null) => {
    const docNo = doc?.document_no || '';
    const enqNo = doc?.enquiry_no || '';
    const custRef = doc?.customer_ref || doc?.subject || '';
    const vessel = doc?.vessel_name || doc?.location_name || '';
    const expiryDate = fmtDate(doc?.expiry_date);
    const companyName = settings?.company_name || 'CEL-RON ENTERPRISES PTE LTD';
    const fromEmail = settings?.email || 'sales@celron.net';
    const fromPhone = settings?.phone || '+65 9768 5891';
    const web = settings?.website || settings?.company_url || 'www.celron.net';

    const toEmail = customer?.email1 || customer?.email || '';
    if (!toEmail) return null;

    const subject = [
        `Quotation ${docNo}`,
        custRef && `— ${custRef}`,
        vessel && `| ${vessel}`,
        enqNo && `| Enq: ${enqNo}`,
    ].filter(Boolean).join(' ');

    const body = [
        `Dear ${customer?.name || 'Sir/Madam'},`,
        '',
        `Thank you for your enquiry. Please find our Quotation ${docNo} as attached / detailed below.`,
        '',
        custRef ? `Reference   : ${custRef}` : null,
        vessel  ? `Vessel/Loc  : ${vessel}` : null,
        enqNo   ? `Enquiry Ref : ${enqNo}` : null,
        `Valid Until : ${expiryDate}`,
        '',
        pdfUrl
            ? `📎 Quotation PDF: ${pdfUrl}`
            : 'Please find the quotation PDF attached to this email.',
        '',
        'We look forward to your valued order.',
        '',
        `Best Regards,`,
        companyName,
        `${fromEmail} | ${fromPhone} | ${web}`,
    ].filter(line => line !== null).join('\n');

    return `mailto:${toEmail}?bcc=${encodeURIComponent(BCC_EMAILS)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
};

/**
 * Build a pre-filled mailto: URL to send a Purchase Order to a supplier.
 */
export const buildPOMailtoUrl = (doc, supplier, settings = {}, pdfUrl = null) => {
    const docNo = doc?.document_no || '';
    const enqNo = doc?.enquiry_no || '';
    const vessel = doc?.vessel_name || doc?.location_name || '';
    const companyName = settings?.company_name || 'CEL-RON ENTERPRISES PTE LTD';
    const fromEmail = settings?.email || 'enquiry@celron.net';
    const fromPhone = settings?.phone || '+65 9768 5891';

    const toEmail = supplier?.email1 || supplier?.email || '';
    if (!toEmail) return null;

    const subject = [
        `Purchase Order: ${docNo}`,
        vessel && `| ${vessel}`,
        enqNo && `| Enq: ${enqNo}`,
    ].filter(Boolean).join(' ');

    const body = [
        `Dear ${supplier?.name || 'Supplier'},`,
        '',
        `Please find our Purchase Order ${docNo} for your reference.`,
        '',
        vessel  ? `Vessel/Loc  : ${vessel}` : null,
        enqNo   ? `Enquiry Ref : ${enqNo}` : null,
        '',
        pdfUrl
            ? `📎 Purchase Order PDF: ${pdfUrl}`
            : 'Please find the PO attached to this email.',
        '',
        'Kindly acknowledge receipt and confirm delivery schedule.',
        '',
        `Best Regards,`,
        companyName,
        `${fromEmail} | ${fromPhone}`,
    ].filter(line => line !== null).join('\n');

    return `mailto:${toEmail}?from=${encodeURIComponent(FROM_EMAIL)}&bcc=${encodeURIComponent(BCC_EMAILS)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
};

/**
 * Open a mailto: URL (or WhatsApp URL) safely, with fallback alert if no email
 * @param {string|null} url
 * @param {string} fallbackMsg
 */
export const openEmailUrl = (url, fallbackMsg = 'No email address configured.') => {
    if (!url) {
        alert(fallbackMsg);
        return false;
    }
    window.open(url, '_blank');
    return true;
};
