import html2pdf from 'html2pdf.js';
import { getDocumentSettings } from './store';

export const generateDocumentPDF = async (job, documentType) => {
    const customer = job.enquiries?.partners;
    const items = job.enquiries?.catalog_items || [];
    const dateToday = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    // Fetch dynamic settings for logo and company info
    const settings = await getDocumentSettings(job.company_id);
    const logoUrl = settings?.logo_url || '/logo.png';
    const signatureUrl = settings?.signature_url;
    const companyName = settings?.company_name || 'CEL-RON ENTERPRISES PTE LTD';
    const address = settings?.address || '10, Jln, Besar, "Sim Lim Tower", #03-05, Singapore 208787';
    const phone = settings?.phone || '+65 6299 1234';
    const email = settings?.email || 'sales@celron.net';
    const web = settings?.website || settings?.company_url || 'www.celron.net';
    const gst = settings?.gst_uen || '201436227C';
    const showWatermark = settings?.watermark ?? true;

    // Document Specific Content
    let specificContent = '';
    if (documentType === 'Service Report') {
        specificContent = `
            <div style="margin-top: 30px; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px;">
                <h3 style="margin: 0 0 10px 0; font-size: 14px; color: #1e3a8a; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">WORK PERFORMED / FINDINGS</h3>
                <div style="min-height: 150px; font-size: 13px; color: #475569; line-height: 1.6;">
                    [ENTER SERVICE DETAILS HERE]
                </div>
            </div>
            <div style="margin-top: 20px; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px;">
                <h3 style="margin: 0 0 10px 0; font-size: 14px; color: #1e3a8a; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">TOOLS / STANDARDS USED</h3>
                <div style="min-height: 80px; font-size: 13px; color: #475569;">
                    [ENTER CALIBRATION STANDARDS HERE]
                </div>
            </div>
        `;
    } else if (documentType === 'Calibration List') {
        specificContent = `
            <div style="margin-top: 30px;">
                <h3 style="margin: 0 0 15px 0; font-size: 14px; color: #1e3a8a; text-transform: uppercase;">Equipment Calibration Status</h3>
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="background-color: #f8fafc;">
                            <th style="padding: 10px; border: 1px solid #cbd5e1; text-align: left; font-size: 11px;">Serial No</th>
                            <th style="padding: 10px; border: 1px solid #cbd5e1; text-align: left; font-size: 11px;">Instrument Name</th>
                            <th style="padding: 10px; border: 1px solid #cbd5e1; text-align: center; font-size: 11px;">Cal Date</th>
                            <th style="padding: 10px; border: 1px solid #cbd5e1; text-align: center; font-size: 11px;">Due Date</th>
                            <th style="padding: 10px; border: 1px solid #cbd5e1; text-align: center; font-size: 11px;">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${items.map(item => `
                            <tr>
                                <td style="padding: 10px; border: 1px solid #cbd5e1; font-size: 12px;">${item.specification || '-'}</td>
                                <td style="padding: 10px; border: 1px solid #cbd5e1; font-size: 12px;">${item.name}</td>
                                <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: center; font-size: 12px;">-</td>
                                <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: center; font-size: 12px;">-</td>
                                <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: center; font-size: 12px; color: #10b981; font-weight: bold;">PASS</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } else if (documentType === 'Delivery Order') {
        const doData = job.currentDO || {}; // We'll pass this via a temporary property
        specificContent = `
            <div style="margin-top: 30px; border: 1px solid #e2e8f0; border-radius: 8px; padding: 25px; background: #fff;">
                <h3 style="margin: 0 0 15px 0; font-size: 14px; color: #1e3a8a; text-transform: uppercase; border-bottom: 2px solid #f1f5f9; padding-bottom: 10px;">DELIVERY INFORMATION</h3>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; font-size: 13px;">
                    <div>
                        <p style="margin: 0 0 8px 0; color: #64748b;">DELIVERY TO:</p>
                        <p style="margin: 0; font-weight: 700; color: #1e293b;">${doData.delivery_to || 'N/A'}</p>
                    </div>
                    <div>
                        <p style="margin: 0 0 8px 0; color: #64748b;">PIC DETAILS:</p>
                        <p style="margin: 0; font-weight: 700; color: #1e293b;">${doData.pic_name || 'N/A'}</p>
                        <p style="margin: 4px 0 0 0;">${doData.pic_phone || ''} ${doData.pic_email ? '| ' + doData.pic_email : ''}</p>
                    </div>
                    <div>
                        <p style="margin: 0 0 8px 0; color: #64748b;">DIMENSIONS:</p>
                        <p style="margin: 0; font-weight: 600;">${doData.dimensions || '-'}</p>
                    </div>
                    <div>
                        <p style="margin: 0 0 8px 0; color: #64748b;">WEIGHT:</p>
                        <p style="margin: 0; font-weight: 600;">${doData.weight || '-'}</p>
                    </div>
                </div>
                <div style="margin-top: 30px; border-top: 1px solid #f1f5f9; padding-top: 20px;">
                    <p style="color: #64748b; font-size: 12px; margin-bottom: 10px;">Special Instructions / Remarks:</p>
                    <div style="min-height: 80px; font-size: 13px; color: #1e293b; line-height: 1.5;">${doData.remarks || '-'}</div>
                </div>
            </div>
        `;
    } else if (documentType === 'Invoice') {
        const totalAmount = job.po_amount || 0;
        specificContent = `
            <div style="margin-top: 40px; border-top: 2px solid #f1f5f9; padding-top: 20px;">
                <div style="display: flex; justify-content: flex-end;">
                    <table style="width: 250px; font-size: 14px;">
                        <tr>
                            <td style="padding: 8px 0; color: #64748b;">Subtotal:</td>
                            <td style="padding: 8px 0; text-align: right; font-weight: 600;">$${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b;">GST (0%):</td>
                            <td style="padding: 8px 0; text-align: right; font-weight: 600;">$0.00</td>
                        </tr>
                        <tr style="border-top: 2px solid #1e3a8a;">
                            <td style="padding: 12px 0; color: #1e3a8a; font-weight: 800; font-size: 16px;">TOTAL DUE:</td>
                            <td style="padding: 12px 0; text-align: right; font-weight: 800; font-size: 16px; color: #1e3a8a;">$${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        </tr>
                    </table>
                </div>
                <div style="margin-top: 40px; padding: 20px; background: #f8fafc; border-radius: 8px; font-size: 12px;">
                    <p style="margin: 0 0 10px 0; font-weight: 700; color: #1e3a8a;">PAYMENT INFORMATION</p>
                    <p style="margin: 4px 0;">Bank: DBS Bank Ltd</p>
                    <p style="margin: 4px 0;">Account Name: CEL-RON ENTERPRISES PTE LTD</p>
                    <p style="margin: 4px 0;">Account No: 123-456789-0</p>
                    <p style="margin: 4px 0;">Swift Code: DBSSGSG</p>
                    <p style="margin: 10px 0 0 0; color: #64748b;">Please quote Job No <span style="font-weight: 700;">${job.job_no}</span> when making payment.</p>
                </div>
            </div>
        `;
    }

    let htmlContent = `
        <div style="padding: 50px; font-family: 'Inter', system-ui, -apple-system, sans-serif; color: #1e293b; max-width: 900px; margin: 0 auto; background: #fff;">
            <!-- Header section -->
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; border-bottom: 3px solid #4f46e5; padding-bottom: 30px;">
                <div style="flex: 1.5;">
                    <img src="${logoUrl}" alt="Company Logo" style="height: 60px; object-fit: contain; margin-bottom: 15px;" />
                    <h2 style="margin: 0; font-size: 20px; color: #1e1b4b; font-weight: 800;">${companyName}</h2>
                    <p style="margin: 6px 0; font-size: 11px; color: #475569; font-weight: 500;">GST / UEN: ${gst} • ISO 9001:2015 Certified</p>
                    <p style="margin: 4px 0; font-size: 11px; color: #64748b;">${address}</p>
                    <p style="margin: 4px 0; font-size: 11px; color: #64748b;">Phone: ${phone} | Email: ${email} | Web: ${web}</p>
                </div>
                <div style="flex: 1; text-align: right;">
                    <h1 style="margin: 0; font-size: 28px; color: #4f46e5; text-transform: uppercase; font-weight: 900;">${documentType}</h1>
                    <div style="margin-top: 15px; font-size: 13px;">
                        <p style="margin: 4px 0;"><strong>Job No:</strong> ${job.job_no}</p>
                        <p style="margin: 4px 0;"><strong>Date:</strong> ${dateToday}</p>
                        <p style="margin: 4px 0;"><strong>PO Ref:</strong> ${job.po_ref || '-'}</p>
                        <p style="margin: 4px 0;"><strong>Enquiry No:</strong> ${job.enquiries?.enquiry_no || '-'}</p>
                    </div>
                </div>
            </div>

            <!-- Addresses Section -->
            <div style="display: flex; justify-content: space-between; margin-bottom: 40px; background: #f8fafc; padding: 25px; border-radius: 12px; border: 1px solid #e2e8f0;">
                <div style="flex: 1;">
                    <h3 style="margin: 0 0 12px 0; font-size: 12px; color: #6366f1; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700;">CUSTOMER DETAILS</h3>
                    <p style="margin: 0 0 6px 0; font-weight: 800; font-size: 16px; color: #0f172a;">${customer?.name || 'Walk-in Customer'}</p>
                    <p style="margin: 0 0 6px 0; font-size: 13px; color: #334155; line-height: 1.5; white-space: pre-wrap;">
                        ${customer?.address || 'N/A'}
                        ${(customer?.city || customer?.country || customer?.pincode) ? `\n${[customer?.city, customer?.country, customer?.pincode].filter(Boolean).join(', ')}` : ''}
                    </p>
                    <p style="margin: 0; font-size: 13px; color: #64748b;"><strong>Contact:</strong> ${customer?.contact_person || 'N/A'}</p>
                </div>
            </div>

            ${documentType !== 'Calibration List' ? `
            <!-- Items Table -->
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 40px;">
                <thead>
                    <tr style="background-color: #4f46e5; color: white;">
                        <th style="padding: 12px; text-align: left; font-size: 11px; border-top-left-radius: 8px;">SR#</th>
                        <th style="padding: 12px; text-align: left; font-size: 11px;">DESCRIPTION / SPECIFICATION</th>
                        <th style="padding: 12px; text-align: center; font-size: 11px;">QTY</th>
                        <th style="padding: 12px; text-align: right; font-size: 11px;">UNIT PRICE</th>
                        <th style="padding: 12px; text-align: right; font-size: 11px; border-top-right-radius: 8px;">AMOUNT</th>
                    </tr>
                </thead>
                <tbody>
                    ${items.length === 0 ? `
                        <tr><td colspan="5" style="padding: 30px; border: 1px solid #e2e8f0; text-align: center; color: #94a3b8; font-style: italic;">No items specified</td></tr>
                    ` : items.map((item, index) => `
                        <tr>
                            <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px;">${index + 1}</td>
                            <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">
                                <div style="font-weight: 700; color: #0f172a; font-size: 13px;">${item.name}</div>
                                <div style="font-size: 12px; color: #64748b; margin-top: 4px;">${item.specification || '-'}</div>
                            </td>
                            <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; text-align: center; font-size: 13px;">1</td>
                            <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; text-align: right; font-size: 13px;">-</td>
                            <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; text-align: right; font-size: 13px; font-weight: 600;">-</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            ` : ''}

            ${specificContent}

            <!-- Footer Details -->
            <div style="margin-top: 50px; padding-top: 30px; border-top: 1px solid #f1f5f9; position: relative;">
                ${showWatermark ? `
                <div style="position: absolute; top: -150px; left: 50%; transform: translateX(-50%) rotate(-30deg); font-size: 80px; color: rgba(226, 232, 240, 0.4); font-weight: 900; pointer-events: none; z-index: 0; white-space: nowrap; text-transform: uppercase;">
                    ${documentType}
                </div>
                ` : ''}
                
                <div style="display: flex; justify-content: space-between; align-items: flex-end; position: relative; z-index: 1;">
                    <div style="width: 280px; text-align: center;">
                        <div style="height: 100px; display: flex; align-items: center; justify-content: center; border-bottom: 2px solid #1e3a8a; margin-bottom: 12px; padding: 5px;">
                            ${signatureUrl ?
            `<img src="${signatureUrl}" alt="Authorised Signature" style="max-height: 90px; max-width: 100%; object-fit: contain;" />` :
            `<div style="color: #cbd5e1; font-size: 11px; font-style: italic; margin-top: 40px;">[ AUTHORISED SIGNATORY ]</div>`
        }
                        </div>
                        <p style="margin: 0; font-weight: 800; font-size: 13px; color: #1e1b4b; letter-spacing: 0.5px;">For ${companyName}</p>
                    </div>
                    
                    <div style="width: 280px; text-align: center;">
                        <div style="height: 100px; border-bottom: 2px solid #64748b; margin-bottom: 12px;"></div>
                        <p style="margin: 0; font-weight: 800; font-size: 13px; color: #1e1b4b; letter-spacing: 0.5px;">RECEIVED BY / CUSTOMER CHOP</p>
                        <p style="margin: 6px 0 0 0; font-size: 10px; color: #94a3b8; font-weight: 500;">Printed: ${new Date().toLocaleString('en-GB')}</p>
                    </div>
                </div>
            </div>
            
            <div style="text-align: center; margin-top: 40px; font-size: 10px; color: #94a3b8; border-top: 1px solid #f8fafc; padding-top: 15px; font-style: italic;">
                This is a computer-generated document. The signature above is digitally applied.
            </div>
        </div>
    `;

    const container = document.createElement('div');
    container.innerHTML = htmlContent;
    document.body.appendChild(container);

    const opt = {
        margin: 0,
        filename: `${documentType.replace(/\s+/g, '_')}_${job.job_no}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, allowTaint: false, scrollX: 0, scrollY: 0, letterRendering: true },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
    };

    try {
        const pdfWorker = html2pdf().set(opt).from(container);

        // Save to local downloads
        await pdfWorker.save();

        // Return the blob for auto-saving to Drive if needed
        const blob = await pdfWorker.output('blob');
        return blob;
    } catch (err) {
        console.error("PDF Generation error:", err);
        return null;
    } finally {
        document.body.removeChild(container);
    }
};
