import html2pdf from 'html2pdf.js';
import { getStoredToken } from './googleAuthService';

export const generateSleekPDF = async (documentData, settings, action = 'download') => {
    const {
        document_type = 'Workflow',
        document_no = 'Draft',
        issue_date,
        expiry_date,
        partners,
        contacts,
        vessels,
        work_locations,
        subject,
        salesperson_name,
        currency = 'SGD',
        items = [],
        subtotal = 0,
        tax_amount = 0,
        total_amount = 0,
        notes,
        terms_conditions,
        payment_terms,
        assigned_job_no,
        customer_ref
    } = documentData;

    const companyLogo = settings?.logo_url || 'https://celron.net/wp-content/uploads/2023/12/celronlogowithtranslogorotating.gif';
    const companyName = settings?.company_name || 'CELRON ENTERPRISES PTE LTD';
    const companyAddress = settings?.address || '10, Jln, Besar, "Sim Lim Tower", #03-05, Singapore 208787';
    const companyUen = settings?.gst_uen || '201436227C';
    const companySignature = settings?.signature_url || '/nrkumarsign.png';
    const companyPaynow = settings?.paynow_url;

    const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) : '-';
    
    // Check if we should hide prices (for DO and PKL)
    const isDeliveryDoc = document_type?.toUpperCase().includes('DELIVERY') || document_type?.toUpperCase().includes('PACKING');

    const isAnithaType = ['Tax Invoice', 'Purchase Order', 'Delivery Order', 'Proforma Invoice', 'Packing List', 'Statement Of Account', 'Order Acknowledgment'].includes(document_type);
    
    const isKumar = salesperson_name?.toUpperCase() === 'N.R.KUMAR' || salesperson_name?.toUpperCase() === 'KUMAR';
    
    const effectiveSalesperson = isKumar ? 'N.R.KUMAR' : ((isAnithaType && (!salesperson_name)) ? 'ANITHA (Ms)' : (salesperson_name || 'ANITHA (Ms)'));
    const effectiveEmail = isKumar ? 'kumar@celron.net' : ((isAnithaType && (!documentData.salesperson_email)) ? 'accounts@celron.net' : (documentData.salesperson_email || 'sales@celron.net'));
    const effectivePhone = isKumar ? '+65 97685891' : ((isAnithaType && (!documentData.salesperson_phone)) ? '+6581962270' : (documentData.salesperson_phone || '+6581962270'));

    // Helper to convert image URL to base64 for reliable rendering
    const getBase64Image = async (url) => {
        if (!url) return '';
        if (url.startsWith('data:')) return url;
        
        // Handle Google Drive links
        if (url.includes('drive.google.com')) {
            try {
                const fileIdMatch = url.match(/d\/([a-zA-Z0-9_-]+)/);
                if (fileIdMatch && fileIdMatch[1]) {
                    const token = getStoredToken();
                    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileIdMatch[1]}?alt=media`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const blob = await response.blob();
                    return new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result);
                        reader.readAsDataURL(blob);
                    });
                }
            } catch (err) {
                console.error('Failed to fetch GDrive image for PDF:', err);
                return ''; // Return empty string so it doesn't break PDF rendering
            }
        }

        try {
            const response = await fetch(url, { mode: 'cors' });
            const blob = await response.blob();
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(blob);
            });
        } catch (e) {
            console.error('Failed to convert image to base64:', e);
            return url; // Fallback to original URL
        }
    };

    const logoB64 = await getBase64Image(companyLogo);
    const signatureB64 = await getBase64Image(companySignature);
    const paynowB64 = await getBase64Image(companyPaynow);

    // Pre-process items for base64 images to prevent async mapping issues
    const processedItems = await Promise.all(items.map(async (item) => {
        if (item.is_image && item.image_url) {
            const base64 = await getBase64Image(item.image_url);
            return { ...item, _base64_image: base64 };
        }
        return item;
    }));

    const htmlContent = `
        <div style="padding: 0; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b !important; width: 800px; min-height: 1060px; background: #ffffff !important; position: relative; padding-bottom: 60px; box-sizing: border-box; margin: 0 auto; color-scheme: light !important;">
            <style>
                * { color-scheme: light !important; -webkit-print-color-adjust: exact !important; }
                p { margin: 0 0 4px 0; color: #1e293b !important; }
                b, strong { font-weight: 700; color: #1e293b !important; }
                ul, ol { margin: 4px 0; padding-left: 20px; }
                li { margin-bottom: 2px; }
            </style>
            
            <!-- Company Header -->
            <div style="padding: 30px 50px 10px 50px; display: flex; justify-content: space-between; align-items: flex-start;">
                <div style="flex: 1;">
                   <img src="${logoB64}" style="height: 70px; object-fit: contain; margin-bottom: 10px;" />
                   <div style="font-size: 15px; font-weight: 700; color: #1e293b;">${companyName}</div>
                   <div style="font-size: 11px; color: #1e3a8a; font-weight: 600; margin-top: 2px;">CR, GST & UEN : ${companyUen}</div>
                   ${paynowB64 ? `<div style="margin-top:10px;"><img src="${paynowB64}" style="width: 100px; height: 100px;" /></div>` : ''}
                </div>
                <div style="text-align: right; color: #475569; font-size: 11px; flex: 1; line-height: 1.5;">
                    <div style="white-space: pre-wrap;">${companyAddress}</div>
                </div>
            </div>

            <!-- Title & Vessel Banner -->
            <div style="margin-top: 5px; display: flex; justify-content: flex-end; position: relative;">
                <div style="background: #f1f5f9; padding: 12px 40px; border-radius: 40px 0 0 40px; min-width: 400px; text-align: right;">
                    <h1 style="margin: 0; font-size: 24px; color: #1e3a8a; font-weight: 700; letter-spacing: -0.5px;">${document_type} # ${document_no}</h1>
                    ${vessels ? `<div style="margin-top: 4px; font-size: 13px; font-weight: 600; color: #1e293b;">Vessel Name : <span style="font-weight: 400;">${vessels.vessel_name}</span></div>` : ''}
                    ${assigned_job_no ? `<div style="margin-top: 4px; font-size: 13px; font-weight: 700; color: #10b981;">Job No: <span style="font-weight: 700;">${assigned_job_no}</span></div>` : ''}
                    ${customer_ref ? `<div style="margin-top: 4px; font-size: 11px; font-weight: 600; color: #475569;">Reference: <span style="font-weight: 400;">${customer_ref}</span></div>` : ''}
                </div>
            </div>

            <!-- Customer & Metadata Grid -->
            <div style="padding: 20px 50px 10px 50px;">
                <div style="margin-bottom: 20px;">
                    <div style="font-size: 14px; font-weight: 700; color: #1e293b; margin-bottom: 4px;">${partners?.name || 'Walk-in Customer'}</div>
                    <div style="font-size: 11px; color: #475569; line-height: 1.5; max-width: 450px; white-space: pre-wrap;">
                        ${partners?.address || ''}
                        ${(partners?.city || partners?.country || partners?.pincode) ? `\n${[partners?.city, partners?.country, partners?.pincode].filter(Boolean).join(', ')}` : ''}
                        ${(partners?.phone1 || partners?.phone) ? `\nTel: ${partners?.phone1 || partners?.phone}` : ''}
                        ${(partners?.email1 || partners?.email) ? `\nEmail: ${partners?.email1 || partners?.email}` : ''}
                        ${partners?.weblink ? `\n${partners.weblink}` : ''}
                    </div>
                    ${partners?.registration_no ? `<div style="font-size: 11px; color: #475569; margin-top: 2px;">GST No.: ${partners.registration_no}</div>` : ''}
                </div>

                <!-- Horizontal Context Bar -->
                <div style="background: #f8fafc; border-radius: 10px; display: flex; padding: 12px 0; border: 1px solid #e2e8f0;">
                    <div style="flex: 1; padding: 0 15px; border-right: 1px solid #e2e8f0;">
                        <div style="font-size: 9px; color: #94a3b8; font-weight: 700; text-transform: uppercase;">Date</div>
                        <div style="font-size: 11px; font-weight: 600; color: #1e293b; margin-top: 3px;">${formatDate(issue_date)}</div>
                    </div>
                    <div style="flex: 1; padding: 0 15px; border-right: 1px solid #e2e8f0;">
                        <div style="font-size: 9px; color: #94a3b8; font-weight: 700; text-transform: uppercase;">Due Date</div>
                        <div style="font-size: 11px; font-weight: 600; color: #1e293b; margin-top: 3px;">${formatDate(expiry_date)}</div>
                    </div>
                    ${payment_terms ? `
                    <div style="flex: 1.2; padding: 0 15px; border-right: 1px solid #e2e8f0;">
                        <div style="font-size: 9px; color: #94a3b8; font-weight: 700; text-transform: uppercase;">Payment Terms</div>
                        <div style="font-size: 11px; font-weight: 700; color: #1e3a8a; margin-top: 3px;">${payment_terms.toUpperCase()}</div>
                    </div>
                    ` : ''}
                    <div style="flex: 1.5; padding: 0 15px;">
                        <div style="font-size: 9px; color: #94a3b8; font-weight: 700; text-transform: uppercase;">Salesperson</div>
                        <div style="font-size: 11px; font-weight: 700; color: #1e293b; margin-top: 3px;">${effectiveSalesperson.toUpperCase()}</div>
                        <div style="font-size: 8px; color: #64748b; margin-top: 1px;">${effectiveEmail} | ${effectivePhone}</div>
                    </div>
                </div>
            </div>

            <!-- Subject -->
            ${subject ? `
            <div style="padding: 0 50px 10px 50px;">
                <div style="font-size: 12px; font-weight: 700; color: #1e3a8a; border-left: 3px solid #1e3a8a; padding-left: 10px;">
                    SUBJECT: <span style="text-decoration: underline;">${subject.toUpperCase()}</span>
                </div>
            </div>
            ` : ''}

            <!-- Items Table -->
            <div style="padding: 10px 50px;">
                <table style="width: 100%; border-collapse: collapse; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; table-layout: fixed;">
                    <thead>
                        <tr style="background: #1e3a8a; color: #fff;">
                            <th style="padding: 10px 15px; text-align: left; font-size: 11px; font-weight: 700; width: ${isDeliveryDoc ? '80%' : '50%'};">Description</th>
                            <th style="padding: 10px 15px; text-align: center; font-size: 11px; font-weight: 700; width: 15%;">Qty</th>
                            ${!isDeliveryDoc ? `
                                <th style="padding: 10px 15px; text-align: right; font-size: 11px; font-weight: 700; width: 17%;">Price</th>
                                <th style="padding: 10px 15px; text-align: right; font-size: 11px; font-weight: 700; width: 18%;">Total (${currency})</th>
                            ` : ''}
                        </tr>
                    </thead>
                    <tbody>
                        ${processedItems.length > 0 ? processedItems.map((item) => {
        if (item.is_section) {
            return `
                                    <tr style="background: #f1f5f9;">
                                        <td colspan="${isDeliveryDoc ? '2' : '4'}" style="padding: 8px 15px; font-size: 11px; font-weight: 700; color: #1e3a8a; border-bottom: 1px solid #e2e8f0;">${item.description.toUpperCase()}</td>
                                    </tr>
                                `;
        }
        if (item.is_note) {
            return `
                                    <tr>
                                        <td colspan="${isDeliveryDoc ? '2' : '4'}" style="padding: 6px 15px; font-size: 10px; color: #64748b; font-style: italic; border-bottom: 1px solid #e2e8f0; white-space: pre-wrap;">${item.description}</td>
                                    </tr>
                                `;
        }
        if (item.is_image) {
            return `
                                    <tr>
                                        <td colspan="${isDeliveryDoc ? '2' : '4'}" style="padding: 15px; text-align: center; border-bottom: 1px solid #e2e8f0;">
                                            <div style="font-weight: 700; text-align: left; margin-bottom: 10px; color: #1e3a8a;">${item.description}</div>
                                            <img src="${item._base64_image}" style="max-width: 100%; max-height: 500px; object-fit: contain; border-radius: 8px;" />
                                        </td>
                                    </tr>
                                `;
        }
        return `
                                <tr>
                                    <td style="padding: 12px 15px; font-size: 11px; color: #1e293b; border-bottom: 1px solid #e2e8f0; word-wrap: break-word;">
                                        <div style="font-weight: 700;">${item.description}</div>
                                        ${item.details ? `<div style="font-size: 10px; color: #64748b; margin-top: 3px; line-height: 1.4; white-space: pre-wrap;">${item.details}</div>` : ''}
                                    </td>
                                    <td style="padding: 12px 15px; text-align: center; font-size: 11px; color: #475569; border-bottom: 1px solid #e2e8f0; border-left: 1px solid #e2e8f0;">${(item.quantity ?? 0).toLocaleString()} ${item.uom || 'PC(S)'}</td>
                                    ${!isDeliveryDoc ? `
                                        <td style="padding: 12px 15px; text-align: right; font-size: 11px; color: #475569; border-bottom: 1px solid #e2e8f0; border-left: 1px solid #e2e8f0;">${(item.unit_price ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                        <td style="padding: 12px 15px; text-align: right; font-size: 11px; font-weight: 700; color: #1e293b; border-bottom: 1px solid #e2e8f0; border-left: 1px solid #e2e8f0;">${(item.amount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                    ` : ''}
                                </tr>
                            `;
    }).join('') : `
                            <tr>
                                <td colspan="${isDeliveryDoc ? '2' : '4'}" style="padding: 40px; text-align: center; color: #94a3b8; font-style: italic; border-bottom: 1px solid #e2e8f0;">No items listed</td>
                            </tr>
                        `}
                    </tbody>
                </table>

                <!-- Totals -->
                ${!isDeliveryDoc ? `
                    <div style="display: flex; justify-content: flex-end; margin-top: 10px;">
                        <table style="width: 280px; border-collapse: collapse; font-size: 11px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
                            <tr>
                                <td style="padding: 8px 15px; color: #64748b;">Subtotal</td>
                                <td style="padding: 8px 15px; text-align: right; font-weight: 700;">${currency} ${(subtotal || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            </tr>
                            ${documentData.discount_amount > 0 ? `
                                <tr>
                                    <td style="padding: 8px 15px; color: #ef4444;">Discount (${documentData.discount_percent}%)</td>
                                    <td style="padding: 8px 15px; text-align: right; font-weight: 700; color: #ef4444;">- ${currency} ${(documentData.discount_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                </tr>
                            ` : ''}
                            <tr>
                                <td style="padding: 8px 15px; color: #64748b;">GST (9%)</td>
                                <td style="padding: 8px 15px; text-align: right; font-weight: 700;">${currency} ${(tax_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            </tr>
                            <tr style="background: #1e3a8a; color: #fff;">
                                <td style="padding: 10px 15px; font-weight: 700; font-size: 13px; border-radius: 0 0 0 8px;">TOTAL</td>
                                <td style="padding: 10px 15px; text-align: right; font-weight: 800; font-size: 14px; border-radius: 0 0 8px 0;">${currency} ${(total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            </tr>
                        </table>
                    </div>
                ` : ''}
            </div>

            <!-- Notes & Terms -->
            <div style="padding: 10px 50px;">
                <div style="font-size: 10px; color: #1e293b; line-height: 1.6;">
                    ${notes ? `<div style="margin-bottom: 10px; white-space: pre-wrap; font-weight: 500; border-top: 1px solid #f1f5f9; padding-top: 10px;">${notes}</div>` : ''}
                    ${terms_conditions ? `<div style="margin-top: 10px; color: #475569;">Payment terms: ${terms_conditions}</div>` : ''}
                </div>
            </div>

            <!-- Signatures -->
            <div style="margin-top: 40px; padding: 0 50px; display: flex; justify-content: space-between; align-items: flex-end;">
                 <div style="text-align: center;">
                    ${signatureB64 ? `<img src="${signatureB64}" style="max-height: 80px; max-width: 180px; object-fit: contain; margin-bottom: 5px;" />` : `<div style="height: 60px;"></div>`}
                    <div style="border-top: 1.5px solid #1e293b; padding-top: 8px; font-size: 10px; color: #1e293b; font-weight: 700; min-width: 200px;">Authorized Signature</div>
                    <div style="font-size: 9px; color: #64748b; margin-top: 2px;">${companyName}</div>
                 </div>
                 
                 <div style="text-align: center;">
                    <div style="height: 60px;"></div>
                    <div style="border-top: 1.5px solid #cbd5e1; padding-top: 8px; font-size: 10px; color: #475569; font-weight: 600; min-width: 200px;">Customer Acknowledgment</div>
                 </div>
            </div>

            <!-- Footer -->
            <div style="position: absolute; bottom: 15px; left: 0; width: 100%; padding: 0 50px; box-sizing: border-box;">
                <div style="border-top: 1px solid #1e293b; display: flex; justify-content: center; padding-top: 10px; font-size: 12px; color: #1e293b; font-weight: 700; letter-spacing: 3px;">
                    WWW.CELRON.NET
                </div>
            </div>

        </div>
    `;

    const container = document.createElement('div');
    container.id = 'pdf-render-container';
    container.innerHTML = htmlContent;
    Object.assign(container.style, {
        position: 'absolute',
        left: '-9999px',
        top: '0',
        width: '800px',
        backgroundColor: 'white',
        visibility: 'visible',
        display: 'block',
        margin: '0',
        padding: '0',
        colorScheme: 'light'
    });
    
    document.body.appendChild(container);

    const opt = {
        margin: 0,
        filename: `${document_no || 'Document'}_${(document_type || 'Workflow').replace(/\s+/g, '_')}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
            scale: 2,
            useCORS: true,
            allowTaint: false,
            scrollX: 0,
            scrollY: 0,
            letterRendering: true,
            backgroundColor: '#ffffff',
            width: 800,
            onclone: (clonedDoc) => {
                const el = clonedDoc.getElementById('pdf-render-container');
                if (el) {
                    el.style.position = 'absolute';
                    el.style.left = '0';
                    el.style.top = '0';
                }
            }
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    try {
        if (document.fonts) await document.fonts.ready;

        const waitForImages = () => {
            const imgs = container.getElementsByTagName('img');
            return Promise.all(Array.from(imgs).map(img => {
                if (img.complete) return Promise.resolve();
                return new Promise(resolve => {
                    img.onload = resolve;
                    img.onerror = resolve;
                });
            }));
        };
        await waitForImages();

        // DEEP STABILIZATION: Wait longer for everything to settle
        await new Promise(r => setTimeout(r, 4000));

        const pdfBlob = await html2pdf()
            .set(opt)
            .from(container)
            .toPdf()
            .output('blob');

        console.log("PDF: SUCCESS. Blob Size:", pdfBlob.size);

        if (pdfBlob.size < 1000) {
            throw new Error("Generated PDF is too small, likely empty.");
        }

        // Remove container immediately after capture
        if (document.body.contains(container)) {
            document.body.removeChild(container);
        }

        if (action === 'download') {
            const url = URL.createObjectURL(pdfBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = opt.filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 2000);
            return;
        } else if (action === 'blob') {
            return pdfBlob;
        } else {
            return URL.createObjectURL(pdfBlob);
        }

    } catch (err) {
        console.error("CRITICAL PDF ERROR:", err);
        throw err;
    } finally {
        if (document.body.contains(container)) {
            document.body.removeChild(container);
        }
    }
};
