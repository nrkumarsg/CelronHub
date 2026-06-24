/**
 * ============================================================
 *  Enquiry PDF Service
 *  Generates:
 *    1. RFQ document PDF (for floating to suppliers)
 *    2. Quotation routing — auto-saves Quotation PDFs generated
 *       by WorkflowEditor into the Enquiry's "Quote2Cust" GDrive subfolder
 *    3. PO routing — auto-saves PO PDFs into "Order2Supplier" subfolder
 *
 *  DEPENDENCIES: html2pdf.js, driveService.js, store.js
 * ============================================================
 */

import html2pdf from 'html2pdf.js';

// ─── Internal helpers ──────────────────────────────────────────────────────────

const fmtDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const safe = (v, fallback = '—') => (v != null && v !== '') ? v : fallback;

/**
 * Formats enquiry catalog_items into HTML table rows.
 * Handles sections, notes, and regular item lines.
 */
const buildItemRows = (items = []) => {
    let srNo = 0;
    return items.map(item => {
        if (item.is_section) {
            return `
                <tr>
                    <td colspan="5" style="padding: 10px 14px; background: #f1f5f9; font-weight: 800;
                        font-size: 12px; color: #3730a3; text-transform: uppercase;
                        letter-spacing: 0.04em; border-bottom: 1px solid #e2e8f0;">
                        ${item.name || ''}
                    </td>
                </tr>`;
        }
        if (item.is_note) {
            return `
                <tr>
                    <td colspan="5" style="padding: 6px 14px; font-size: 11px; color: #64748b;
                        font-style: italic; border-bottom: 1px solid #f1f5f9;">
                        Note: ${item.name || ''}
                    </td>
                </tr>`;
        }
        srNo++;
        const qty = item.qty || item.quantity || '1';
        const uom = item.uom || item.unit || 'pcs';
        return `
            <tr style="background: ${srNo % 2 === 0 ? '#f8fafc' : '#fff'}">
                <td style="padding: 10px 14px; font-size: 12px; color: #64748b; text-align: center; border-bottom: 1px solid #f1f5f9;">
                    ${srNo}
                </td>
                <td style="padding: 10px 14px; font-size: 13px; font-weight: 700; color: #0f172a; border-bottom: 1px solid #f1f5f9;">
                    ${item.name || ''}
                    ${item.specification ? `<div style="font-size: 11px; font-weight: 400; color: #64748b; margin-top: 3px;">${item.specification}</div>` : ''}
                </td>
                <td style="padding: 10px 14px; font-size: 12px; text-align: center; border-bottom: 1px solid #f1f5f9;">
                    ${safe(qty)}
                </td>
                <td style="padding: 10px 14px; font-size: 12px; text-align: center; border-bottom: 1px solid #f1f5f9;">
                    ${safe(uom)}
                </td>
                <td style="padding: 10px 14px; font-size: 12px; text-align: center; color: #94a3b8; border-bottom: 1px solid #f1f5f9;">
                    —
                </td>
            </tr>`;
    }).join('');
};

// ─── RFQ HTML Generator ────────────────────────────────────────────────────────

const buildRFQHtml = (enquiry, settings) => {
    const logoUrl = settings?.logo_url || '/logo.png';
    const signatureUrl = settings?.signature_url || null;
    const companyName = settings?.company_name || 'CEL-RON ENTERPRISES PTE LTD';
    const address = settings?.address || '10, Jln Besar, "Sim Lim Tower", #03-05, Singapore 208787';
    const phone = settings?.phone || '+65 9768 5891';
    const email = settings?.email || 'enquiry@celron.net';
    const web = settings?.website || settings?.company_url || 'www.celron.net';
    const gst = settings?.gst_uen || '201436227C';

    const items = enquiry?.catalog_items || [];
    const dateStr = fmtDate(new Date());

    return `
    <div style="padding: 48px; font-family: 'Inter', system-ui, -apple-system, sans-serif;
        color: #1e293b; max-width: 900px; margin: 0 auto; background: #fff;">

        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start;
            margin-bottom: 36px; padding-bottom: 24px; border-bottom: 3px solid #6366f1;">
            <div style="flex: 1.5;">
                <img src="${logoUrl}" alt="Logo" style="height: 55px; object-fit: contain; margin-bottom: 12px;" />
                <h2 style="margin: 0; font-size: 18px; color: #1e1b4b; font-weight: 800;">${companyName}</h2>
                <p style="margin: 5px 0; font-size: 10.5px; color: #64748b;">GST/UEN: ${gst}</p>
                <p style="margin: 3px 0; font-size: 10.5px; color: #64748b;">${address}</p>
                <p style="margin: 3px 0; font-size: 10.5px; color: #64748b;">
                    ${phone} | ${email} | ${web}
                </p>
            </div>
            <div style="flex: 1; text-align: right;">
                <h1 style="margin: 0; font-size: 26px; color: #6366f1; font-weight: 900;
                    text-transform: uppercase; letter-spacing: 0.04em;">
                    REQUEST FOR QUOTATION
                </h1>
                <div style="margin-top: 14px; font-size: 12px; line-height: 1.8;">
                    <p style="margin: 2px 0;"><strong>RFQ No:</strong> ${safe(enquiry?.enquiry_no)}</p>
                    <p style="margin: 2px 0;"><strong>Date:</strong> ${dateStr}</p>
                    <p style="margin: 2px 0;"><strong>Customer Ref:</strong> ${safe(enquiry?.customer_ref)}</p>
                    <p style="margin: 2px 0;"><strong>Required By:</strong> ${fmtDate(enquiry?.due_date)}</p>
                </div>
            </div>
        </div>

        <!-- Enquiry Info -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;
            margin-bottom: 32px; background: #f8fafc; padding: 22px;
            border-radius: 12px; border: 1px solid #e2e8f0;">
            <div>
                <p style="margin: 0 0 4px; font-size: 10px; color: #6366f1; font-weight: 700;
                    text-transform: uppercase; letter-spacing: 0.05em;">Customer / Project</p>
                <p style="margin: 0; font-size: 15px; font-weight: 800; color: #0f172a;">
                    ${safe(enquiry?.customer_name || enquiry?.partners?.name)}
                </p>
                <p style="margin: 4px 0 0; font-size: 12px; color: #64748b;">
                    ${safe(enquiry?.vessel || enquiry?.vessel_name || enquiry?.location || '')}
                </p>
            </div>
            <div>
                <p style="margin: 0 0 4px; font-size: 10px; color: #6366f1; font-weight: 700;
                    text-transform: uppercase; letter-spacing: 0.05em;">Enquiry Details</p>
                <p style="margin: 0; font-size: 13px; font-weight: 600; color: #1e293b;">
                    ${safe(enquiry?.description || enquiry?.subject, 'As per items listed below')}
                </p>
                <p style="margin: 4px 0 0; font-size: 11px; color: #94a3b8;">
                    Received: ${fmtDate(enquiry?.enquiry_date || enquiry?.created_at)}
                </p>
            </div>
        </div>

        <!-- Items Table -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 36px;">
            <thead>
                <tr style="background: linear-gradient(90deg, #6366f1, #4f46e5); color: #fff;">
                    <th style="padding: 11px 14px; font-size: 11px; text-align: center; width: 50px; border-top-left-radius: 8px;">
                        SR#
                    </th>
                    <th style="padding: 11px 14px; font-size: 11px; text-align: left;">
                        DESCRIPTION / PART NO.
                    </th>
                    <th style="padding: 11px 14px; font-size: 11px; text-align: center; width: 70px;">
                        QTY
                    </th>
                    <th style="padding: 11px 14px; font-size: 11px; text-align: center; width: 70px;">
                        UOM
                    </th>
                    <th style="padding: 11px 14px; font-size: 11px; text-align: center; width: 100px; border-top-right-radius: 8px;">
                        UNIT PRICE
                    </th>
                </tr>
            </thead>
            <tbody>
                ${items.length > 0 ? buildItemRows(items) : `
                    <tr>
                        <td colspan="5" style="padding: 30px; text-align: center; color: #94a3b8;
                            font-style: italic; border: 1px solid #e2e8f0;">
                            No items listed — refer to attached enquiry document
                        </td>
                    </tr>`
                }
            </tbody>
        </table>

        <!-- Footer Notes -->
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px;
            padding: 18px 22px; margin-bottom: 36px; font-size: 11.5px; color: #475569; line-height: 1.7;">
            <strong style="color: #1e293b;">Please provide:</strong><br/>
            ✓ Unit Price (SGD or your currency with exchange rate)<br/>
            ✓ Lead Time &amp; Delivery Date<br/>
            ✓ Part Number, Brand, and Country of Manufacture<br/>
            ✓ Technical specifications or approved alternatives<br/>
            ✓ Payment terms &amp; warranty conditions
        </div>

        <!-- Signature -->
        <div style="display: flex; justify-content: space-between; align-items: flex-end;
            padding-top: 24px; border-top: 1px solid #f1f5f9;">
            <div style="width: 260px; text-align: center;">
                <div style="height: 80px; display: flex; align-items: center; justify-content: center;
                    border-bottom: 2px solid #1e3a8a; margin-bottom: 10px;">
                    ${signatureUrl
                        ? `<img src="${signatureUrl}" alt="Signature" style="max-height: 70px; object-fit: contain;" />`
                        : `<div style="color: #cbd5e1; font-size: 11px; font-style: italic;">[ AUTHORISED SIGNATORY ]</div>`
                    }
                </div>
                <p style="margin: 0; font-weight: 800; font-size: 12px; color: #1e1b4b;">
                    For ${companyName}
                </p>
            </div>
            <div style="font-size: 10px; color: #94a3b8; text-align: right;">
                <p style="margin: 0;">Generated: ${new Date().toLocaleString('en-GB')}</p>
                <p style="margin: 4px 0 0;">Reply to: enquiry@celron.net</p>
            </div>
        </div>

        <div style="text-align: center; margin-top: 32px; font-size: 10px; color: #cbd5e1;
            border-top: 1px solid #f8fafc; padding-top: 12px;">
            This is a computer-generated RFQ document. ${companyName}
        </div>
    </div>`;
};

// ─── Public Functions ───────────────────────────────────────────────────────────

/**
 * Generate RFQ PDF and download it.
 * Returns the PDF blob for optional GDrive upload.
 *
 * @param {Object} enquiry   - The enquiry record with catalog_items
 * @param {Object} settings  - Company settings from getDocumentSettings()
 * @returns {Blob|null}      - PDF blob
 */
export const generateEnquiryRFQPdf = async (enquiry, settings) => {
    const html = buildRFQHtml(enquiry, settings);
    const filename = `RFQ_${enquiry?.enquiry_no || 'Draft'}_${new Date().toISOString().slice(0, 10)}.pdf`;

    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);

    const opt = {
        margin: 0,
        filename,
        image: { type: 'jpeg', quality: 0.97 },
        html2canvas: { scale: 2, useCORS: true, scrollX: 0, scrollY: 0 },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
    };

    try {
        const worker = html2pdf().set(opt).from(container);
        await worker.save();
        const blob = await worker.output('blob');
        return blob;
    } catch (err) {
        console.error('[EnquiryPDF] RFQ generation failed:', err);
        return null;
    } finally {
        document.body.removeChild(container);
    }
};

/**
 * Auto-route a PDF blob (already generated by WorkflowEditor) to the
 * correct Enquiry GDrive subfolder.
 *
 * Call this after WorkflowEditor generates a Quotation or PO PDF
 * when formData.enquiry_id is set.
 *
 * @param {Object} params
 * @param {Blob}   params.pdfBlob       - The PDF blob from html2pdf
 * @param {string} params.filename      - e.g. "Quotation_CEL2506-001_ABC.pdf"
 * @param {string} params.enquiryId     - UUID of the enquiry record
 * @param {string} params.documentType  - 'Quotation' | 'Purchase Order'
 * @param {string} params.driveToken    - Google OAuth token (from getStoredToken)
 * @param {string} params.rootFolderId  - CELRONHUB root folder ID from settings
 * @param {Object} params.enquiry       - Enquiry record (needs enquiry_no, customer_name, gdrive_folder_id)
 * @returns {{ url: string, fileId: string } | null}
 */
export const routePdfToEnquiryFolder = async ({
    pdfBlob,
    filename,
    enquiryId,
    documentType,
    driveToken,
    rootFolderId,
    enquiry
}) => {
    if (!pdfBlob || !driveToken || !enquiry) {
        console.warn('[EnquiryPDF] Missing blob, token, or enquiry — skipping Drive upload');
        return null;
    }

    try {
        const { provisionEnquiryFolderStructure, uploadFileToDrive, getOrCreateFolder } = await import('./driveService');

        // 1. Get or provision the enquiry folder (returns { enqFolderId, quote2CustId, order2SupplierId, ... })
        let quote2CustId = null;
        let order2SupplierId = null;
        let enqFolderId = enquiry?.gdrive_folder_id;

        if (!enqFolderId) {
            // Provision the full folder structure now
            const year = new Date().getFullYear().toString();
            const folderName = `${enquiry.enquiry_no || enquiryId} - ${enquiry.customer_name || enquiry.partners?.name || 'Customer'}`;
            const result = await provisionEnquiryFolderStructure(driveToken, rootFolderId, year, folderName);

            enqFolderId = result.enqFolderId;
            quote2CustId = result.quote2CustId;
            order2SupplierId = result.order2SupplierId;

            // Persist folder IDs back to Supabase
            const { supabase } = await import('./supabase');
            await supabase
                .from('customer_enquiries')
                .update({
                    gdrive_folder_id: enqFolderId,
                    gdrive_quote2cust_id: quote2CustId,
                    gdrive_order2supplier_id: order2SupplierId
                })
                .eq('id', enquiryId);
        } else {
            // Folder exists — get or create the specific subfolder directly
            quote2CustId = await getOrCreateFolder(driveToken, 'Quote2Cust', enqFolderId);
            order2SupplierId = await getOrCreateFolder(driveToken, 'Order2Supplier', enqFolderId);
        }

        if (!enqFolderId) {
            console.warn('[EnquiryPDF] Could not resolve enquiry Drive folder');
            return null;
        }

        // 2. Determine target subfolder ID
        const isPO = documentType === 'Purchase Order';
        const subFolderId = isPO ? order2SupplierId : quote2CustId;
        const subfolderName = isPO ? 'Order2Supplier' : 'Quote2Cust';

        if (!subFolderId) {
            console.warn(`[EnquiryPDF] Could not resolve subfolder: ${subfolderName}`);
            return null;
        }

        // 3. Upload PDF to the subfolder
        const file = new File([pdfBlob], filename, { type: 'application/pdf' });
        const result = await uploadFileToDrive(driveToken, file, { folderId: subFolderId });

        const fileUrl = `https://drive.google.com/file/d/${result.id}/view`;
        console.log(`[EnquiryPDF] ✓ PDF saved to ${subfolderName}: ${fileUrl}`);
        return { url: fileUrl, fileId: result.id, subfolderName };
    } catch (err) {
        console.error('[EnquiryPDF] routePdfToEnquiryFolder error:', err);
        return null;
    }
};


/**
 * Convenience wrapper: generates AND routes an RFQ PDF to the Drive folder.
 *
 * @param {Object} enquiry   - Enquiry record with catalog_items
 * @param {Object} settings  - Company settings
 * @param {string} driveToken - Google OAuth token
 * @returns {{ url: string, fileId: string } | null}
 */
export const generateAndSaveRFQPdf = async (enquiry, settings, driveToken) => {
    const blob = await generateEnquiryRFQPdf(enquiry, settings);
    if (!blob) return null;

    const filename = `RFQ_${enquiry?.enquiry_no || 'Draft'}_${new Date().toISOString().slice(0, 10)}.pdf`;
    const rootFolderId = settings?.gdrive_celron_root_id || settings?.google_drive_folder_id;

    return routePdfToEnquiryFolder({
        pdfBlob: blob,
        filename,
        enquiryId: enquiry.id,
        documentType: 'Quotation', // goes into Quote2Cust
        driveToken,
        rootFolderId,
        enquiry
    });
};
