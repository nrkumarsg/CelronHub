import html2pdf from 'html2pdf.js';
import { getStoredToken } from './googleAuthService';

const amountToWords = (amount, currency = 'SGD') => {
    const ones = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'];
    const tens = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];
    const teens = ['TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN'];

    const convert = (num) => {
        if (num === 0) return '';
        if (num < 10) return ones[num];
        if (num < 20) return teens[num - 10];
        if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 !== 0 ? ' ' + ones[num % 10] : '');
        if (num < 1000) return ones[Math.floor(num / 100)] + ' HUNDRED' + (num % 100 !== 0 ? ' AND ' + convert(num % 100) : '');
        if (num < 1000000) return convert(Math.floor(num / 1000)) + ' THOUSAND' + (num % 1000 !== 0 ? ' ' + convert(num % 1000) : '');
        if (num < 1000000000) return convert(Math.floor(num / 1000000)) + ' MILLION' + (num % 1000000 !== 0 ? ' ' + convert(num % 1000000) : '');
        return '';
    };

    if (!amount || isNaN(amount)) return '';

    const [integerPart, decimalPart] = parseFloat(amount).toFixed(2).split('.');
    const intNum = parseInt(integerPart);
    const decNum = parseInt(decimalPart);

    let result = (currency === 'SGD' ? 'SINGAPORE DOLLARS ' : currency + ' ') + (intNum === 0 ? 'ZERO' : convert(intNum));
    
    if (decNum > 0) {
        result += ' AND CENTS ' + convert(decNum);
    }
    
    return result + ' ONLY';
};

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
    const cleanBankDetails = (settings?.bank_details || '').split('\n').map(line => line.trim()).join('\n');

    const formatDate = (d) => {
        if (!d) return '-';
        const date = new Date(d);
        if (isNaN(date.getTime())) return '-';
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = String(date.getFullYear()).slice(-2);
        return `${day}/${month}/${year}`;
    };

    const getDocNoPrefix = (type) => {
        const t = type?.toUpperCase() || '';
        if (t.includes('DELIVERY')) return 'DO.NO';
        if (t.includes('PACKING')) return 'PKL.NO';
        if (t.includes('TAX INVOICE') || t.includes('PROFORMA INVOICE') || t.includes('INVOICE')) return 'INV.NO';
        if (t.includes('QUOTE') || t.includes('QUOTATION')) return 'QT.NO';
        if (t.includes('PURCHASE')) return 'PO.NO';
        if (t.includes('STATEMENT')) return 'SOA.NO';
        if (t.includes('ACKNOWLEDG')) return 'ACK.NO';
        return 'DOC.NO';
    };
    
    // Check if we should hide prices (for DO and PKL)
    const isDeliveryDoc = document_type?.toUpperCase().includes('DELIVERY') || document_type?.toUpperCase().includes('PACKING');
    const isPurchaseOrder = document_type?.toUpperCase().includes('PURCHASE') || document_type?.toUpperCase().includes('PO') || document_type?.toUpperCase().includes('SUPPLIER');

    const isAnithaType = ['Tax Invoice', 'Purchase Order', 'Delivery Order', 'Proforma Invoice', 'Packing List', 'Statement Of Account', 'Order Acknowledgment'].includes(document_type);
    
    const isInvoice = document_type?.toUpperCase() === 'TAX INVOICE' || document_type?.toUpperCase() === 'INVOICE';
    const isProforma = document_type?.toUpperCase() === 'PROFORMA INVOICE' || document_type?.toUpperCase() === 'PRO';
    const isPayment = document_type?.toUpperCase() === 'PAYMENT RECEIVED' || document_type?.toUpperCase() === 'OFFICIAL RECEIPT';
    const isFinancial = isInvoice || isProforma || isPayment;
    
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

    const cleanVesselName = vessels?.vessel_name?.trim();
    const hasVessel = !!cleanVesselName && 
        !['', 'N/A', 'N.A', 'N.A.', 'N/A.', 'NONE', 'NIL', '[VESSEL]', 'NOT APPLICABLE'].includes(cleanVesselName.toUpperCase());
    const vesselNameVal = hasVessel ? cleanVesselName.toUpperCase() : 'N/A';

    const htmlContent = `
        <div style="padding: 40px; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #000 !important; width: 800px; min-height: 1060px; background: #ffffff !important; position: relative; padding-bottom: 80px; box-sizing: border-box; margin: 0 auto; color-scheme: light !important;">
            <style>
                * { color-scheme: light !important; -webkit-print-color-adjust: exact !important; }
                p { margin: 0 0 4px 0; color: #000 !important; }
                b, strong { font-weight: 700; color: #000 !important; }
                ul, ol { margin: 4px 0; padding-left: 20px; }
                li { margin-bottom: 2px; }
                .total-row-cell { color: #ffffff !important; }
            </style>
            
            <!-- Company Header Block -->
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                <div style="flex: 0.8;">
                   <img src="${logoB64}" style="height: 65px; object-fit: contain; margin-bottom: 5px;" />
                </div>
                <div style="text-align: right; color: #000; font-size: 10.5px; flex: 1.2; line-height: 1.4; font-family: 'Segoe UI', Arial, sans-serif;">
                    <div style="font-size: 16px; font-weight: 800; color: #d92727; letter-spacing: 0.5px;">CEL-RON ENTERPRISES PTE LTD</div>
                    <div style="font-weight: 700; margin-top: 2px;">UEN NO. 201436227C</div>
                    <div style="font-weight: 700; font-style: italic; font-size: 9.5px; margin-top: 1px; color: #334155;">&ldquo;Sim Lim Tower&rdquo;</div>
                    <div style="margin-top: 2px; color: #475569; font-weight: 500;">
                        10, Jln, Besar, "Sim Lim Tower" #03-05, Singapore 208787<br>
                        Phone: +65 81962270 &nbsp; Email: sales@celron.net<br>
                        www.celron.net
                    </div>
                </div>
            </div>

            <!-- Document Metadata row -->
            <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 15px; font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; font-weight: 700; color: #1e3a8a;">
                <div style="width: 30%; text-align: left; text-transform: uppercase;">
                    ${getDocNoPrefix(document_type)}: <span style="color: #000;">${document_no}</span>
                </div>
                <div style="width: 40%; text-align: center; font-size: 20px; font-weight: 800; color: #1e3a8a; text-transform: uppercase; letter-spacing: 1px;">
                    ${document_type}
                </div>
                <div style="width: 30%; text-align: right; text-transform: uppercase;">
                    DATE: <span style="color: #000;">${formatDate(issue_date)}</span>
                </div>
            </div>

            <!-- Solid blue line separator -->
            <div style="border-bottom: 2px solid #1e3a8a; margin-top: 10px; margin-bottom: 20px;"></div>

            <!-- Customer & Metadata Grid -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; font-family: 'Segoe UI', Arial, sans-serif;">
                
                <!-- TO Box (Left) -->
                <div style="border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; min-height: 180px; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between; background: white;">
                    <div>
                        <div style="color: #1e3a8a; font-weight: 700; font-size: 12px; margin-bottom: 6px; text-transform: uppercase;">TO:</div>
                        ${hasVessel ? `
                            <div style="font-weight: 800; font-size: 12px; color: #000; text-transform: uppercase; margin-bottom: 2px;">
                                MASTER AND OWNER OF ${vesselNameVal}
                            </div>
                            <div style="font-weight: 700; font-size: 11px; color: #000; margin-bottom: 4px;">
                                C/O ${partners?.name || 'Walk-in Customer'}
                            </div>
                        ` : `
                            <div style="font-weight: 800; font-size: 12px; color: #000; text-transform: uppercase; margin-bottom: 2px;">
                                ${partners?.name || 'Walk-in Customer'}
                            </div>
                        `}
                        <div style="font-size: 10.5px; color: #1e293b; line-height: 1.4; white-space: pre-wrap;">${partners?.address || ''}</div>
                        <div style="font-size: 10.5px; color: #1e293b; margin-top: 4px;">
                            Phone: ${partners?.phone1 || partners?.phone || 'N/A'} &nbsp; Email: ${partners?.email1 || partners?.email || 'N/A'}
                        </div>
                    </div>
                    <div>
                        <div style="border-top: 1px solid #cbd5e1; margin: 8px 0 6px 0;"></div>
                        <div style="font-weight: 700; font-size: 11px; color: #000;">
                            ATTN: ${contacts?.name || contacts?.contact_name || partners?.contact_person || 'N/A'}
                        </div>
                        <div style="font-size: 10px; color: #475569; margin-top: 1px;">
                            HP: ${contacts?.handphone || contacts?.mobile_phone || partners?.phone1 || partners?.phone || 'N/A'} &nbsp; Email: ${contacts?.email || partners?.email1 || partners?.email || 'N/A'}
                        </div>
                    </div>
                </div>

                <!-- Key-Value metadata box (Right) -->
                <div style="border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; min-height: 180px; box-sizing: border-box; background: white;">
                    <table style="width: 100%; height: 100%; border-collapse: collapse; font-size: 10.5px; table-layout: fixed; font-family: 'Segoe UI', Arial, sans-serif;">
                        <tr style="border-bottom: 1px solid #cbd5e1;">
                            <td style="width: 35%; padding: 6px 10px; font-weight: 700; color: #1e3a8a; border-right: 1px solid #cbd5e1; background: #f8fafc; text-transform: uppercase;">VESSEL</td>
                            <td style="width: 65%; padding: 6px 10px; font-weight: 700; color: #000; text-transform: uppercase; word-wrap: break-word;">${vesselNameVal}</td>
                        </tr>
                        <tr style="border-bottom: 1px solid #cbd5e1;">
                            <td style="padding: 6px 10px; font-weight: 700; color: #1e3a8a; border-right: 1px solid #cbd5e1; background: #f8fafc; text-transform: uppercase;">PAYMENT TERMS</td>
                            <td style="padding: 6px 10px; font-weight: 700; color: #000; text-transform: uppercase; word-wrap: break-word;">${payment_terms || 'COD'}</td>
                        </tr>
                        <tr style="border-bottom: 1px solid #cbd5e1;">
                            <td style="padding: 6px 10px; font-weight: 700; color: #1e3a8a; border-right: 1px solid #cbd5e1; background: #f8fafc; text-transform: uppercase;">REFERENCE</td>
                            <td style="padding: 6px 10px; font-weight: 700; color: #000; text-transform: uppercase; word-wrap: break-word;">${customer_ref || 'WALK IN'}</td>
                        </tr>
                        <tr style="border-bottom: 1px solid #cbd5e1;">
                            <td style="padding: 6px 10px; font-weight: 700; color: #1e3a8a; border-right: 1px solid #cbd5e1; background: #f8fafc; text-transform: uppercase;">JOB NO</td>
                            <td style="padding: 6px 10px; font-weight: 700; color: #10b981; text-transform: uppercase; word-wrap: break-word;">${assigned_job_no || 'Draft'}</td>
                        </tr>
                        <tr>
                            <td style="padding: 6px 10px; font-weight: 700; color: #1e3a8a; border-right: 1px solid #cbd5e1; background: #f8fafc; text-transform: uppercase;">SALESPERSON</td>
                            <td style="padding: 6px 10px; font-weight: 700; color: #000; word-wrap: break-word; line-height: 1.3;">
                                ${effectiveSalesperson.toUpperCase()}
                                <div style="font-size: 9px; font-weight: normal; color: #475569; margin-top: 2px;">
                                    ${effectivePhone} | ${effectiveEmail}
                                </div>
                            </td>
                        </tr>
                    </table>
                </div>

            </div>

            <!-- Subject Line -->
            <div style="text-align: center; margin: 20px 0; font-weight: 700; font-size: 12.5px; color: #000; font-family: 'Segoe UI', Arial, sans-serif;">
                SUBJECT: <span style="text-decoration: underline;">${subject?.toUpperCase() || ''}</span>
            </div>

            <!-- Items Table -->
            <div style="margin-bottom: 20px; font-family: 'Segoe UI', Arial, sans-serif;">
                <table style="width: 100%; border-collapse: collapse; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; font-size: 10.5px; table-layout: fixed;">
                    <thead>
                        <tr style="background: #f1f5f9; border-bottom: 1px solid #cbd5e1;">
                            <th style="padding: 10px; border-right: 1px solid #cbd5e1; text-align: center; width: 8%; color: #000; font-weight: 700;">S/N</th>
                            <th style="padding: 10px; border-right: 1px solid #cbd5e1; text-align: left; width: ${isDeliveryDoc ? '77%' : '52%'}; color: #000; font-weight: 700;">DESCRIPTION</th>
                            <th style="padding: 10px; ${!isDeliveryDoc ? 'border-right: 1px solid #cbd5e1;' : ''} text-align: center; width: 15%; color: #000; font-weight: 700;">QTY</th>
                            ${!isDeliveryDoc ? `
                            <th style="padding: 10px; border-right: 1px solid #cbd5e1; text-align: right; width: 12%; color: #000; font-weight: 700;">PRICE</th>
                            <th style="padding: 10px; text-align: right; width: 13%; color: #000; font-weight: 700;">TOTAL</th>
                            ` : ''}
                        </tr>
                    </thead>
                    <tbody>
                        ${(() => {
                            let sn = 0;
                            return processedItems.length > 0 ? processedItems.map((item) => {
                                if (item.is_section) {
                                    return `
                                        <tr style="background: #f8fafc; border-bottom: 1px solid #cbd5e1;">
                                            <td colspan="${isDeliveryDoc ? '3' : '5'}" style="padding: 8px 10px; font-weight: 700; color: #1e3a8a; border-right: none;">${item.description.toUpperCase()}</td>
                                        </tr>
                                    `;
                                }
                                if (item.is_note) {
                                    return `
                                        <tr style="border-bottom: 1px solid #cbd5e1;">
                                            <td colspan="${isDeliveryDoc ? '3' : '5'}" style="padding: 6px 10px; font-size: 9.5px; color: #475569; font-style: italic; white-space: pre-wrap; border-right: none;">${item.description}</td>
                                        </tr>
                                    `;
                                }
                                if (item.is_image) {
                                    return `
                                        <tr style="border-bottom: 1px solid #cbd5e1;">
                                            <td colspan="${isDeliveryDoc ? '3' : '5'}" style="padding: 12px; text-align: center; border-right: none;">
                                                <div style="font-weight: 700; text-align: left; margin-bottom: 8px; color: #1e3a8a;">${item.description}</div>
                                                <img src="${item._base64_image}" style="max-width: 100%; max-height: 400px; object-fit: contain; border-radius: 4px;" />
                                            </td>
                                        </tr>
                                    `;
                                }
                                sn++;
                                return `
                                    <tr style="border-bottom: 1px solid #cbd5e1;">
                                        <td style="padding: 10px; border-right: 1px solid #cbd5e1; text-align: center; color: #000; font-weight: bold; vertical-align: top;">${sn}</td>
                                        <td style="padding: 10px; border-right: 1px solid #cbd5e1; color: #000; word-wrap: break-word; vertical-align: top;">
                                            <div style="font-weight: 700; text-transform: uppercase;">${item.description || ''}</div>
                                            ${item.details ? `<div style="font-size: 9px; color: #475569; margin-top: 3px; line-height: 1.3; white-space: pre-wrap;">${item.details}</div>` : ''}
                                        </td>
                                        <td style="padding: 10px; ${!isDeliveryDoc ? 'border-right: 1px solid #cbd5e1;' : ''} text-align: center; color: #000; font-weight: 700; vertical-align: top;">
                                            ${(item.quantity ?? 0).toLocaleString()} ${item.uom || 'PC(S)'}
                                        </td>
                                        ${!isDeliveryDoc ? `
                                        <td style="padding: 10px; border-right: 1px solid #cbd5e1; text-align: right; color: #000; vertical-align: top;">
                                            ${(item.unit_price ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </td>
                                        <td style="padding: 10px; text-align: right; color: #000; font-weight: 700; vertical-align: top;">
                                            ${(item.amount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </td>
                                        ` : ''}
                                    </tr>
                                `;
                            }).join('') : `
                                <tr>
                                    <td colspan="${isDeliveryDoc ? '3' : '5'}" style="padding: 30px; text-align: center; color: #94a3b8; font-style: italic;">No items listed</td>
                                </tr>
                            `;
                        })()}
                    </tbody>
                </table>
            </div>

            <!-- Notes & Totals Grid -->
            <div style="display: flex; gap: 20px; align-items: flex-start; margin-bottom: 20px; font-family: 'Segoe UI', Arial, sans-serif;">
                
                <!-- NOTES & COMMENTS Box -->
                <div style="border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; flex: 1.2; box-sizing: border-box; min-height: 95px; background: white;">
                    <div style="color: #1e3a8a; font-weight: 700; font-size: 11px; margin-bottom: 6px; text-transform: uppercase;">NOTES & COMMENTS:</div>
                    ${isDeliveryDoc ? `
                        <div style="font-weight: 700; font-size: 9.5px; margin-bottom: 4px; color: #000;">Package Details</div>
                        <ul style="list-style-type: square; padding-left: 15px; margin: 0; color: #000; font-size: 9.5px; line-height: 1.4;">
                            <li>Size of the Package : &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; mm (L) x &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; mm (B) x &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; mm (H)</li>
                            <li>Weight of the Package : &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Kgs</li>
                            <li>Origin of spares : Singapore</li>
                            <li>Total No. of Packages:</li>
                            <li>Package Type (Carton / Wooden Crate / Pallet / Drum):</li>
                            <li>Package Qty:</li>
                            <li>Description of Contents:</li>
                        </ul>
                        ${notes ? `<div style="margin-top: 8px; border-top: 1px solid #e2e8f0; padding-top: 6px; white-space: pre-wrap; font-size: 9.5px; font-weight: 500; color: #000;">${notes}</div>` : ''}
                    ` : `
                        ${isFinancial ? `
                        <div style="color: #000; font-size: 9.5px; line-height: 1.45; text-align: left; width: 100%;">
                            ${notes ? `<div style="white-space: pre-wrap; font-style: italic; color: #475569;"><strong>NOTES & COMMENTS:</strong><br/>${notes}</div>` : ''}
                        </div>
                        ` : `
                        <div style="display: flex; gap: 10px; align-items: flex-start; text-align: left; width: 100%;">
                            ${(paynowB64 && !isPurchaseOrder) ? `
                            <div style="text-align: center; border: 1px solid #cbd5e1; padding: 4px; border-radius: 4px; background: white; flex-shrink: 0;">
                                <img src="${paynowB64}" style="width: 80px; height: 80px; object-fit: contain;" />
                                <div style="font-size: 8px; font-weight: bold; margin-top: 2px; color: #1e3a8a;">PAYNOW UEN</div>
                            </div>
                            ` : ''}
                            <div style="flex: 1; color: #000; font-size: 9.5px; line-height: 1.45;">
                                <div style="font-weight: 700; color: #1e3a8a; font-size: 10px; margin-bottom: 2px;">Bank Transfer Details:</div>
                                <div>Bank: <strong>DBS Bank Ltd</strong></div>
                                <div>Account Name: <strong>CEL-RON ENTERPRISES PTE LTD</strong></div>
                                <div>Account No: <strong>123-456789-0</strong></div>
                                <div>Swift Code: <strong>DBSSGSG</strong></div>
                                ${notes ? `<div style="margin-top: 6px; border-top: 1px solid #e2e8f0; padding-top: 4px; white-space: pre-wrap; font-style: italic; color: #475569;">${notes}</div>` : ''}
                            </div>
                        </div>
                        `}
                    `}
                </div>

                <!-- Totals Box (Only for financial docs) -->
                ${!isDeliveryDoc ? `
                <div style="flex: 0.8; display: flex; justify-content: flex-end;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 10.5px; border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden; font-family: 'Segoe UI', Arial, sans-serif;">
                        <tr style="border-bottom: 1px solid #cbd5e1;">
                            <td style="padding: 6px 10px; color: #475569; background: #f8fafc; font-weight: 600;">Subtotal</td>
                            <td style="padding: 6px 10px; text-align: right; font-weight: 700; color: #000;">${currency} ${(subtotal || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        </tr>
                        ${documentData.discount_amount > 0 ? `
                        <tr style="border-bottom: 1px solid #cbd5e1;">
                            <td style="padding: 6px 10px; color: #ef4444; background: #f8fafc; font-weight: 600;">Discount (${documentData.discount_percent}%)</td>
                            <td style="padding: 6px 10px; text-align: right; font-weight: 700; color: #ef4444;">- ${currency} ${(documentData.discount_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        </tr>
                        ` : ''}
                        <tr style="border-bottom: 1px solid #cbd5e1;">
                            <td style="padding: 6px 10px; color: #475569; background: #f8fafc; font-weight: 600;">GST (9%)</td>
                            <td style="padding: 6px 10px; text-align: right; font-weight: 700; color: #000;">${currency} ${(tax_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        </tr>
                        <tr style="background: #1e3a8a; color: #ffffff;">
                            <td class="total-row-cell" style="padding: 8px 10px; font-weight: 700; font-size: 11px; color: #ffffff;">TOTAL</td>
                            <td class="total-row-cell" style="padding: 8px 10px; text-align: right; font-weight: 800; font-size: 12.5px; color: #ffffff;">${currency} ${(total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        </tr>
                    </table>
                </div>
                ` : `
                <div style="flex: 0.8;"></div>
                `}

            </div>

            <!-- Amount in Words -->
            ${(!isDeliveryDoc && !document_type?.toUpperCase().includes('QUOTE') && !document_type?.toUpperCase().includes('QUOTATION')) ? `
            <div style="margin-top: 15px; font-family: 'Segoe UI', Arial, sans-serif; font-size: 9px; color: #000; font-weight: 600; text-transform: uppercase;">
                AMOUNT IN WORDS: <span style="font-weight: 500;">${amountToWords(total_amount, currency)}</span>
            </div>
            ` : ''}

            <!-- Signatures Section -->
            <div style="display: flex; gap: 20px; margin-top: 30px; font-family: 'Segoe UI', Arial, sans-serif;">
                
                <!-- Authorized Signature -->
                <div style="border: 1px solid #cbd5e1; border-radius: 8px; flex: 1; padding: 12px; text-align: center; min-height: 125px; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between; background: white;">
                    <div style="height: 60px; display: flex; align-items: center; justify-content: center;">
                        ${signatureB64 ? `<img src="${signatureB64}" style="max-height: 55px; max-width: 100%; object-fit: contain;" />` : `<div style="color: #cbd5e1; font-size: 10px; font-style: italic;">[ AUTHORISED SIGNATURE ]</div>`}
                    </div>
                    <div>
                        <div style="border-top: 1px solid #cbd5e1; padding-top: 5px; font-weight: 700; font-size: 9.5px; color: #000; text-transform: uppercase;">AUTHORIZED SIGNATURE</div>
                        <div style="font-size: 8.5px; color: #475569; margin-top: 2px; font-weight: 600;">${companyName}</div>
                    </div>
                </div>

                <!-- Customer Acknowledgment (Toggled with Bank details) -->
                ${isFinancial ? `
                <div style="border: 1px solid #cbd5e1; border-radius: 8px; flex: 1; display: flex; min-height: 125px; box-sizing: border-box; overflow: hidden; background: #f8fafc;">
                    <div style="width: 80px; padding: 8px; display: flex; align-items: center; justify-content: center; background: white; border-right: 1px solid #cbd5e1; flex-shrink: 0;">
                        ${paynowB64 ? `<img src="${paynowB64}" style="max-width: 100%; max-height: 100%; object-fit: contain;" />` : `<div style="font-size: 8px; color: #94a3b8; font-weight: bold; text-align: center;">SCAN TO PAY</div>`}
                    </div>
                    <div style="flex: 1; padding: 10px; text-align: left; display: flex; flex-direction: column; justify-content: center;">
                        <div style="font-weight: 700; font-size: 8.5px; color: #1e3a8a; margin-bottom: 4px; text-transform: uppercase;">BANK ACCOUNT DETAILS</div>
                        <div style="font-size: 8px; white-space: pre-wrap; color: #1e293b; line-height: 1.25;">
                            ${cleanBankDetails || 'Please contact us for bank details.'}
                        </div>
                    </div>
                </div>
                ` : `
                <div style="border: 1px solid #cbd5e1; border-radius: 8px; flex: 1; padding: 12px; text-align: center; min-height: 125px; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between; background: white;">
                    <div style="height: 60px; display: flex; align-items: center; justify-content: center; color: #cbd5e1; font-size: 8.5px; font-style: italic; font-weight: 700; text-transform: uppercase;">
                        ${isDeliveryDoc ? 'RECEIVED IN GOOD ORDER' : 'WE AGREE TO SUPPLY AS PER THIS QUOTE'}
                    </div>
                    <div>
                        <div style="border-top: 1px solid #cbd5e1; padding-top: 5px; font-weight: 700; font-size: 9.5px; color: #000; text-transform: uppercase;">CUSTOMER ACKNOWLEDGMENT</div>
                        <div style="font-size: 8.5px; color: #475569; margin-top: 2px; font-weight: 600; text-transform: uppercase;">${partners?.name || 'Customer Name'}</div>
                    </div>
                </div>
                `}

            </div>

            <!-- Footer Centered WWW.CELRON.NET -->
            <div style="position: absolute; bottom: 20px; left: 40px; right: 40px; font-family: 'Segoe UI', Arial, sans-serif;">
                <div style="border-top: 1px solid #cbd5e1; margin-bottom: 8px;"></div>
                <div style="text-align: center; font-weight: 800; font-size: 12px; color: #1e3a8a; letter-spacing: 5px;">
                    WWW.CELRON.NET
                </div>
            </div>

        </div>
    `;

    const parent = document.createElement('div');
    parent.id = 'pdf-parent-wrapper';
    Object.assign(parent.style, {
        position: 'fixed',
        left: '-9999px',
        top: '-9999px',
        width: '0',
        height: '0',
        overflow: 'hidden'
    });

    const container = document.createElement('div');
    container.id = 'pdf-render-container';
    container.innerHTML = htmlContent;
    Object.assign(container.style, {
        width: '800px',
        backgroundColor: 'white',
        visibility: 'visible',
        display: 'block',
        margin: '0',
        padding: '0',
        colorScheme: 'light'
    });
    
    parent.appendChild(container);
    document.body.appendChild(parent);

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

        // Remove parent immediately after capture
        if (document.body.contains(parent)) {
            document.body.removeChild(parent);
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
        if (document.body.contains(parent)) {
            document.body.removeChild(parent);
        }
    }
};
