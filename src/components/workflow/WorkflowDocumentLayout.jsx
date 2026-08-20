import React from 'react';
import { Mail, Phone, Globe } from 'lucide-react';

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

/**
 * Unified Layout for all Workflow Documents (Quotation, Invoice, DO, etc.)
 * This component is used for:
 * 1. Screen Preview / Print Page
 * 2. Background PDF generation for emails
 */
const WorkflowDocumentLayout = ({ doc, settings, logoBase64, signatureBase64, paynowBase64, showSignature = true }) => {
    if (!doc) return null;

    // Design Tokens / Standard Typography
    const styles = {
        h1: { fontSize: '24px', fontWeight: 900, letterSpacing: '2px', color: '#1e3a8a', textTransform: 'uppercase' },
        h2: { fontSize: '15px', fontWeight: 800, color: '#000000', textTransform: 'uppercase' },
        h3: { fontSize: '13px', fontWeight: 800, color: '#1e3a8a', textTransform: 'uppercase' },
        h4: { fontSize: '11px', fontWeight: 800, color: '#000000', textTransform: 'uppercase' },
        body: { fontSize: '12px', color: '#000000', lineHeight: '1.4' },
        bodyBold: { fontSize: '12px', fontWeight: 800, color: '#000000' },
        small: { fontSize: '10px', color: '#000000' },
        accent: { color: '#10b981' }, // Green for Job No
        border: '1px solid #94a3b8', // Darker border for clarity
        tableHeader: { background: '#f8fafc', borderBottom: '2px solid #1e3a8a' }
    };

    const companyLogo = settings?.logo_url || 'https://celron.net/wp-content/uploads/2023/12/celronlogowithtranslogorotating.gif';
    const companyName = (settings?.company_name || 'CEL-RON ENTERPRISES PTE LTD').replace('CELRON', 'CEL-RON');
    const companyAddress = settings?.address || '10, Jln, Besar, "Sim Lim Tower", #03-05, Singapore 208787';
    const companyUen = settings?.gst_uen || '201436227C';
    const cleanBankDetails = (settings?.bank_details || '').split('\n').map(line => line.trim()).join('\n');

    const formatDate = (d) => {
        if (!d) return '-';
        const date = new Date(d);
        const dd = String(date.getDate()).padStart(2, '0');
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const yy = String(date.getFullYear()).slice(-2);
        return `${dd}/${mm}/${yy}`;
    };
    
    const documentDateFormatted = formatDate(doc.issue_date || new Date());
    let itemCounter = 0;

    const isEffectiveORA = doc.document_type?.toUpperCase() === 'ORDER ACKNOWLEDGMENT' || (doc.document_type?.toUpperCase() === 'QUOTATION' && (doc.document_no || '').startsWith('ORA')) || doc.document_type === 'ORA';
    const isQuotation = doc.document_type?.toUpperCase() === 'QUOTATION' && !isEffectiveORA;
    const isJob = doc.document_type?.toUpperCase() === 'JOB';
    const isDeliveryDoc = doc.document_type === 'Delivery Order' || doc.document_type === 'Packing List';
    const isORA = isEffectiveORA;
    const isInvoice = doc.document_type?.toUpperCase() === 'TAX INVOICE' || doc.document_type?.toUpperCase() === 'INVOICE';
    const isProforma = doc.document_type?.toUpperCase() === 'PROFORMA INVOICE' || doc.document_type === 'PRO';
    const isPayment = doc.document_type === 'Payment Received';
    const isFinancial = isInvoice || isProforma || isPayment;
    const isEnquiry = doc.document_type?.toUpperCase() === 'ENQUIRY';
    const isAnithaType = ['Tax Invoice', 'Purchase Order', 'Delivery Order', 'Proforma Invoice', 'Packing List', 'Statement Of Account', 'Order Acknowledgment'].includes(doc.document_type);
    const isKumar = doc.salesperson_name?.toUpperCase() === 'N.R.KUMAR' || doc.salesperson_name?.toUpperCase() === 'KUMAR';
    const effectiveSalesperson = isKumar ? 'N.R.KUMAR' : ((isAnithaType && (!doc.salesperson_name)) ? 'ANITHA (Ms)' : (doc.salesperson_name || 'ANITHA (Ms)'));
    const effectivePhone = isKumar ? '+65 97685891' : ((isAnithaType && (!doc.salesperson_phone)) ? '+6581962270' : (doc.salesperson_phone || '+6581962270'));
    const effectiveEmail = isKumar ? 'kumar@celron.net' : ((isAnithaType && (!doc.salesperson_email)) ? 'accounts@celron.net' : (doc.salesperson_email || 'sales@celron.net'));

    const docNoLabel = isQuotation ? 'Q.NO' : 
                       isJob ? 'JOB.NO' :
                       isORA ? 'ORA.NO' : 
                       isInvoice ? 'INV.NO' : 
                       isProforma ? 'PRO.NO' :
                       isPayment ? 'RCPT.NO' :
                       isDeliveryDoc ? (doc.document_type === 'Packing List' ? 'PKL.NO' : 'DO.NO') : 
                       'DOC.NO';

    // Default Notes Fallback for Quotations
    const DEFAULT_QUOTATION_NOTES = `<ul>
        <li>Ex-Stock, Subject to Prior Sale. Makers Genuine Spares : OEM Spares : Equivalent Spare</li>
        <li>Lead time : 1~2 Days : 4~6 Weeks : 30 days</li>
        <li>Payment : Advance Payment : COD : 50% Advance and 50% C.O.D : 7DAYS : 14 DAYS : 30 DAYS</li>
        <li>Validity : 30 days.</li>
        <li>Warranty: Manufacturer's standard warranty against manufacturing defects only. This warranty does not cover workmanship errors, misuse, or improper handling.</li>
    </ul>`;

    const DEFAULT_DELIVERY_NOTES = `
        <p><strong>Package Details</strong></p>
        <ul>
            <li>Size of the Package : &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; mm (L) x &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; mm (B) x &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; mm (H)</li>
            <li>Weight of the Package : &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Kgs</li>
            <li>Origin of spares : Singapore</li>
            <li>Total No. of Packages: </li>
            <li>Package Type (Carton / Wooden Crate / Pallet / Drum): </li>
            <li>Package Qty: </li>
            <li>Description of Contents: </li>
        </ul>
    `;

    const notesToDisplay = (!doc.notes || doc.notes.trim() === '' || doc.notes === '<p><br></p>') 
        ? (isQuotation ? DEFAULT_QUOTATION_NOTES : (isDeliveryDoc ? DEFAULT_DELIVERY_NOTES : doc.notes))
        : doc.notes;

    const cleanVesselName = doc.vessels?.vessel_name?.trim() || doc.vessels?.name?.trim();
    const hasVessel = !!cleanVesselName && 
        !['', 'N/A', 'N.A', 'N.A.', 'N/A.', 'NONE', 'NIL', '[VESSEL]', 'NOT APPLICABLE'].includes(cleanVesselName.toUpperCase());
    const vesselName = hasVessel ? cleanVesselName : '';
    const locationName = doc.work_locations?.location_name || doc.work_locations?.name;
    const hasLocation = !!locationName && locationName !== 'N/A';

    let vesselLabel = "VESSEL";
    let vesselValue = "N/A";

    if (hasVessel && hasLocation) {
        vesselLabel = "VESSEL / PROJECT";
        vesselValue = `${vesselName} (${locationName})`;
    } else if (hasLocation) {
        vesselLabel = "PROJECT";
        vesselValue = locationName;
    } else if (hasVessel) {
        vesselLabel = "VESSEL";
        vesselValue = vesselName;
    }

    return (
        <div className="print-paper" style={{
            background: '#fff', width: '100%', maxWidth: '210mm', minHeight: '255mm',
            margin: '0 auto', position: 'relative', boxSizing: 'border-box',
            padding: '24px 30px', display: 'flex', flexDirection: 'column',
            fontFamily: 'Inter, system-ui, sans-serif'
        }}>
            {/* Company Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                <img src={logoBase64 || companyLogo} alt="Logo" style={{ maxHeight: '80px', maxWidth: '250px', objectFit: 'contain' }} />
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '18px', fontWeight: 900 }}>
                        <span style={{ color: '#ef4444' }}>{companyName.split(' ')[0]}</span> <span style={{ color: '#000000' }}>{companyName.split(' ').slice(1).join(' ')}</span>
                    </div>
                    <div style={{ ...styles.h4, marginTop: '2px' }}>UEN NO. {companyUen}</div>
                    <div style={{ ...styles.small, lineHeight: '1.5', marginTop: '2px' }}>
                        <span style={{ fontWeight: 700 }}>&quot;Sim Lim Tower&quot;</span><br />
                        10, Jln, Besar, &quot;Sim Lim Tower&quot; #03-05, Singapore 208787<br />
                        Phone: {settings?.phone || '+65 8196 2270'} &nbsp; Email: {settings?.sales_email || 'sales@celron.net'}<br />
                        {settings?.website || 'www.celron.net'}
                    </div>
                </div>
            </div>

            {/* Document Title Banner */}
            <div style={{ 
                display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', 
                borderBottom: '2px solid #1e3a8a', paddingBottom: '8px', marginBottom: '20px' 
            }}>
                <div style={{ ...styles.h3, width: '30%' }}>{docNoLabel}: {doc.document_no}</div>
                <h1 style={{ ...styles.h1, textAlign: 'center', width: '40%', margin: 0 }}>
                    {isJob ? 'JOB DETAIL' : (isORA ? 'ORDER ACKNOWLEDGMENT' : (isPayment ? 'OFFICIAL RECEIPT' : doc.document_type?.toUpperCase()))}
                </h1>
                <div style={{ ...styles.h3, width: '30%', textAlign: 'right' }}>{isPayment ? 'RECEIPT DATE' : 'DATE'}: {documentDateFormatted}</div>
            </div>

            {/* Recipient & Metadata Grid (Balanced) */}
            <div style={{ display: 'flex', gap: '20px', marginBottom: '20px', alignItems: 'stretch' }}>
                <div style={{ flex: 1, border: styles.border, borderRadius: '10px', padding: '12px', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ ...styles.h3, marginBottom: '4px' }}>{isPayment ? 'RECEIVED FROM:' : 'TO:'}</div>
                    {hasVessel ? (
                        <>
                            <div style={styles.bodyBold}>MASTER AND OWNER OF {vesselName.toUpperCase()}</div>
                            <div style={styles.bodyBold}>C/O {doc.partners?.name || 'Walk-in Customer'}</div>
                        </>
                    ) : (
                        <div style={styles.bodyBold}>{doc.partners?.name || 'Walk-in Customer'}</div>
                    )}
                    <div style={{ ...styles.small, marginTop: '2px', whiteSpace: 'pre-line' }}>
                        {doc.partners?.address || ''}
                        {(doc.partners?.city || doc.partners?.pincode || doc.partners?.country) && (
                            <div>
                                {[doc.partners?.city, doc.partners?.country, doc.partners?.pincode].filter(Boolean).join(', ')}
                            </div>
                        )}
                    </div>
                    <div style={{ ...styles.small, marginTop: '4px' }}>
                        {(doc.partners?.phone1 || doc.partners?.phone || doc.partners?.phone2) && (
                            <span><strong>Phone:</strong> {doc.partners?.phone1 || doc.partners?.phone || doc.partners?.phone2} &nbsp;&nbsp;</span>
                        )}
                        {(doc.partners?.email1 || doc.partners?.email || doc.partners?.email2) && (
                            <span><strong>Email:</strong> {doc.partners?.email1 || doc.partners?.email || doc.partners?.email2}</span>
                        )}
                        {doc.partners?.weblink && (
                            <div style={{ color: '#1e3a8a', fontSize: '9px', marginTop: '2px' }}>{doc.partners.weblink}</div>
                        )}
                    </div>
                    <div style={{ borderTop: '1px solid #e2e8f0', marginTop: '8px', paddingTop: '8px' }}>
                        <div style={styles.bodyBold}>ATTN: {doc.contacts?.name || doc.partners?.contact_person || 'N/A'}</div>
                        {(doc.contacts?.handphone || doc.contacts?.email) && (
                            <div style={{ ...styles.small, marginTop: '2px' }}>
                                {doc.contacts?.handphone && `HP: ${doc.contacts.handphone}  `}
                                {doc.contacts?.email && `Email: ${doc.contacts.email.toUpperCase()}`}
                            </div>
                        )}
                    </div>
                    {isPayment && (
                        <div style={{ marginTop: '12px', padding: '8px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                            <div style={{ ...styles.h4, color: '#1e3a8a', fontSize: '10px', marginBottom: '4px' }}>PAYMENT INFO</div>
                            <div style={{ ...styles.small, display: 'flex', justifyContent: 'space-between' }}>
                                <span>MODE: <strong>{(doc.payment_method || 'N/A').toUpperCase()}</strong></span>
                                <span>REF: <strong>{(doc.payment_ref || '-').toUpperCase()}</strong></span>
                            </div>
                        </div>
                    )}
                </div>

                <div style={{ flex: 1, border: styles.border, borderRadius: '10px', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', height: '100%' }}>
                        <tbody>
                            {!isDeliveryDoc && (
                                <tr style={{ borderBottom: styles.border }}>
                                    <td style={{ padding: '4px 10px', background: '#f8fafc', ...styles.h3, width: '40%', borderRight: styles.border }}>DUE/EXPIRY</td>
                                    <td style={{ padding: '4px 10px', ...styles.bodyBold }}>{formatDate(doc.expiry_date)}</td>
                                </tr>
                            )}
                            <tr style={{ borderBottom: styles.border }}>
                                <td style={{ padding: '4px 10px', background: '#f8fafc', ...styles.h3, borderRight: styles.border }}>{vesselLabel}</td>
                                <td style={{ padding: '4px 10px', ...styles.bodyBold }}>{vesselValue}</td>
                            </tr>
                            {doc.payment_terms && (
                                <tr style={{ borderBottom: styles.border }}>
                                    <td style={{ padding: '4px 10px', background: '#f8fafc', ...styles.h3, borderRight: styles.border }}>PAYMENT TERMS</td>
                                    <td style={{ padding: '4px 10px', ...styles.bodyBold, color: '#1e3a8a' }}>{doc.payment_terms.toUpperCase()}</td>
                                </tr>
                            )}
                            {doc.customer_ref && (
                                <tr style={{ borderBottom: styles.border }}>
                                    <td style={{ padding: '4px 10px', background: '#f8fafc', ...styles.h3, borderRight: styles.border }}>REFERENCE</td>
                                    <td style={{ padding: '4px 10px', ...styles.bodyBold }}>{doc.customer_ref}</td>
                                </tr>
                            )}
                            {doc.assigned_job_no && (
                                <tr style={{ borderBottom: styles.border }}>
                                    <td style={{ padding: '4px 10px', background: '#f8fafc', ...styles.h3, borderRight: styles.border }}>JOB NO</td>
                                    <td style={{ padding: '4px 10px', ...styles.bodyBold, color: '#10b981' }}>{doc.assigned_job_no}</td>
                                </tr>
                            )}
                            <tr>
                                <td style={{ padding: '4px 10px', background: '#f8fafc', ...styles.h3, borderRight: styles.border, verticalAlign: 'top' }}>SALESPERSON</td>
                                <td style={{ padding: '4px 10px', ...styles.bodyBold }}>
                                    {effectiveSalesperson.toUpperCase()}<br/>
                                    <span style={{ fontWeight: 600 }}>{effectivePhone}</span>
                                    <span style={{ fontWeight: 400, fontSize: '9px', color: '#64748b', marginLeft: '10px' }}>| {effectiveEmail.toLowerCase()}</span>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Subject Area */}
            <div style={{ marginBottom: '20px', textAlign: 'center' }}>
                {doc.subject && <div style={styles.h2}>SUBJECT: <span style={{ textDecoration: 'underline' }}>{doc.subject}</span></div>}
            </div>

            {/* Items Table */}
            <div style={{ border: styles.border, borderRadius: '10px', overflow: 'hidden', marginBottom: '0px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={styles.tableHeader}>
                            <th style={{ padding: '8px 10px', ...styles.h4, width: '6%', borderRight: styles.border }}>S/N</th>
                            <th style={{ padding: '8px 10px', ...styles.h4, width: '49%', borderRight: styles.border, textAlign: 'center' }}>DESCRIPTION</th>
                            <th style={{ padding: '8px 10px', ...styles.h4, width: '15%', borderRight: styles.border }}>QTY</th>
                            {!isDeliveryDoc && !isEnquiry && (
                                <>
                                    <th style={{ padding: '8px 10px', ...styles.h4, width: '15%', borderRight: styles.border }}>UNIT PRICE</th>
                                    <th style={{ padding: '8px 10px', ...styles.h4, width: '15%', textAlign: 'right' }}>AMOUNT ({doc.currency || 'SGD'})</th>
                                </>
                            )}
                        </tr>
                    </thead>
                    <tbody>
                        {(doc.items || []).map((item, idx) => {
                            if (item.is_section) {
                                return (
                                    <tr key={idx} style={{ background: '#f8fafc', borderBottom: styles.border }}>
                                        <td colSpan={(!isDeliveryDoc && !isEnquiry) ? 5 : 3} style={{ padding: '8px 10px', ...styles.bodyBold, color: '#1e3a8a' }}>{item.description?.toUpperCase()}</td>
                                    </tr>
                                );
                            }
                            if (item.is_note) {
                                return (
                                    <tr key={idx} style={{ borderBottom: styles.border }}>
                                        <td colSpan={(!isDeliveryDoc && !isEnquiry) ? 5 : 3} style={{ padding: '8px 10px', ...styles.small, fontStyle: 'italic', whiteSpace: 'pre-wrap' }}>{item.description}</td>
                                    </tr>
                                );
                            }
                            itemCounter++;
                            return (
                                <tr key={idx} style={{ borderBottom: styles.border }}>
                                    <td style={{ padding: '8px 10px', ...styles.small, borderRight: styles.border, textAlign: 'center' }}>{itemCounter}</td>
                                    <td style={{ padding: '8px 10px', ...styles.body, borderRight: styles.border }}>
                                        <div style={{ fontWeight: 800, whiteSpace: 'pre-wrap' }}>{item.description}</div>
                                        {item.details && <div style={{ ...styles.small, marginTop: '2px', whiteSpace: 'pre-wrap' }}>{item.details}</div>}
                                    </td>
                                    <td style={{ padding: '8px 10px', ...styles.bodyBold, borderRight: styles.border, textAlign: 'center' }}>{item.quantity} {item.uom || 'PC(S)'}</td>
                                    {!isDeliveryDoc && !isEnquiry && (
                                        <>
                                            <td style={{ padding: '8px 10px', ...styles.body, borderRight: styles.border, textAlign: 'center' }}>{(parseFloat(item.unit_price) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                            <td style={{ padding: '8px 10px', ...styles.bodyBold, textAlign: 'right' }}>{(parseFloat(item.amount) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                        </>
                                    )}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Footer Section */}
            <div style={{ pageBreakInside: 'avoid' }}>
                
                {/* Totals Section - Separate Rounded Box */}
                <div style={{ width: '100%', marginBottom: '15px' }}>
                    {!isDeliveryDoc && !isEnquiry && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ display: 'flex', border: styles.border, borderRadius: '10px', background: '#f8fafc', alignItems: 'stretch', width: '100%', overflow: 'hidden' }}>
                                {/* Tax/Subtotal info - Stacked Vertically */}
                                <div style={{ padding: '6px 20px', display: 'flex', flexDirection: 'column', gap: '2px', justifyContent: 'center', width: '55%', borderRight: '1px solid #ffffff' }}>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        <span style={{ ...styles.h4, minWidth: '120px' }}>UNTAXED AMOUNT:</span>
                                        <span style={styles.bodyBold}>{(doc.subtotal || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                    </div>
                                    {doc.discount_amount > 0 && (
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                            <span style={{ ...styles.h4, minWidth: '120px', color: '#ef4444' }}>
                                                DISCOUNT {parseFloat(doc.discount_percent) > 0 ? `(${doc.discount_percent}%)` : ''}:
                                            </span>
                                            <span style={{ ...styles.bodyBold, color: '#ef4444' }}>- {(doc.discount_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        <span style={{ ...styles.h4, minWidth: '120px' }}>GST (9%):</span>
                                        <span style={styles.bodyBold}>{(doc.tax_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                    </div>
                                </div>
                                
                                {/* Final Total (Dark Theme) */}
                                <div style={{ background: '#0f172a', color: '#ffffff', padding: '6px 25px', display: 'flex', alignItems: 'center', width: '45%', justifyContent: 'space-between' }}>
                                    <span style={{ ...styles.h3, color: '#ffffff', margin: 0 }}>TOTAL ({doc.currency || 'SGD'})</span>
                                    <span style={{ fontSize: '15px', fontWeight: 900, color: '#ffffff' }}>{(doc.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                            </div>

                            {/* Amount in Words */}
                            {!isQuotation && (
                                <div style={{ 
                                    padding: '4px 15px', 
                                    ...styles.small,
                                    color: '#000000',
                                    fontSize: '9px',
                                    textTransform: 'uppercase',
                                    display: 'flex',
                                    gap: '8px'
                                }}>
                                    <span>AMOUNT IN WORDS:</span>
                                    <span>{amountToWords(doc.total_amount, doc.currency)}</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Terms & Conditions (Prioritized for Quotations) */}
                {isQuotation && doc.terms_conditions && doc.terms_conditions.trim() !== '' && doc.terms_conditions !== '<p><br></p>' && (
                    <div style={{ 
                        ...styles.small, 
                        background: '#f8fafc', 
                        padding: '10px 15px', 
                        border: styles.border, 
                        borderRadius: '10px', 
                        marginBottom: '15px', 
                        width: '100%' 
                    }}>
                        <div style={{ ...styles.h4, marginBottom: '6px', borderBottom: '1px solid #e2e8f0' }}>TERMS & CONDITIONS:</div>
                        <div 
                            style={{ paddingLeft: '5px', wordBreak: 'break-word', overflowWrap: 'break-word' }} 
                            dangerouslySetInnerHTML={{ __html: doc.terms_conditions.replace(/<ul>/g, '<ul style="padding-left: 20px; margin: 0;">') }} 
                        />
                    </div>
                )}

                {/* Notes & Comments - Hide for Quotations, Show for others if they have content */}
                {notesToDisplay && !isQuotation && notesToDisplay.trim() !== '' && notesToDisplay !== '<p><br></p>' && (
                    <div style={{ 
                        ...styles.small, 
                        background: '#f8fafc', 
                        padding: '10px 15px', 
                        border: styles.border, 
                        borderRadius: '10px', 
                        marginBottom: '15px', 
                        width: '100%' 
                    }}>
                        <div style={{ ...styles.h4, marginBottom: '6px', borderBottom: '1px solid #e2e8f0' }}>NOTES & COMMENTS:</div>
                        <div 
                            style={{ paddingLeft: '5px', wordBreak: 'break-word', overflowWrap: 'break-word' }} 
                            dangerouslySetInnerHTML={{ __html: notesToDisplay.replace(/<ul>/g, '<ul style="padding-left: 20px; margin: 0;">') }} 
                        />
                    </div>
                )}

                {/* Terms & Conditions (Standard position for other docs) - HIDE FOR FINANCIALS per user request */}
                {!isQuotation && !isFinancial && doc.terms_conditions && doc.terms_conditions.trim() !== '' && doc.terms_conditions !== '<p><br></p>' && (
                    <div style={{ 
                        ...styles.small, 
                        background: '#f8fafc', 
                        padding: '10px 15px', 
                        border: styles.border, 
                        borderRadius: '10px', 
                        marginBottom: '20px', 
                        width: '100%' 
                    }}>
                        <div style={{ ...styles.h4, marginBottom: '6px', borderBottom: '1px solid #e2e8f0' }}>TERMS & CONDITIONS:</div>
                        <div 
                            style={{ paddingLeft: '5px', wordBreak: 'break-word', overflowWrap: 'break-word' }} 
                            dangerouslySetInnerHTML={{ __html: doc.terms_conditions.replace(/<ul>/g, '<ul style="padding-left: 20px; margin: 0;">') }} 
                        />
                    </div>
                )}

                {/* Flexible Spacer to push following content to bottom */}
                <div style={{ flex: 1 }}></div>

                {/* Signatures */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '15px' }}>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ 
                            border: styles.border, 
                            borderRadius: '10px', 
                            height: '100px', 
                            display: 'flex', 
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            overflow: 'hidden'
                        }}>
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {showSignature && signatureBase64 && <img src={signatureBase64} alt="Signature" style={{ maxHeight: '60px' }} />}
                            </div>
                            <div style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0', padding: '2px 0' }}>
                                <div style={{ ...styles.bodyBold, fontSize: '8px' }}>AUTHORIZED SIGNATURE</div>
                                <div style={{ ...styles.small, fontSize: '7px' }}>{companyName}</div>
                            </div>
                        </div>
                    </div>

                    <div style={{ textAlign: 'center' }}>
                        {isFinancial ? (
                            <div style={{ 
                                border: styles.border, 
                                borderRadius: '10px', 
                                height: '100px', 
                                display: 'flex', 
                                overflow: 'hidden',
                                background: '#f8fafc'
                            }}>
                                <div style={{ width: '80px', padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', borderRight: '1px solid #e2e8f0' }}>
                                    {paynowBase64 ? (
                                        <img src={paynowBase64} alt="PayNow QR" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                                    ) : (
                                        <div style={{ fontSize: '7px', color: '#94a3b8' }}>SCAN TO PAY</div>
                                    )}
                                </div>
                                <div style={{ flex: 1, padding: '10px', textAlign: 'left', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                    <div style={{ ...styles.h4, fontSize: '8px', color: '#1e3a8a', marginBottom: '4px' }}>BANK ACCOUNT DETAILS</div>
                                    <div style={{ ...styles.small, fontSize: '8px', whiteSpace: 'pre-wrap', color: '#1e293b', lineHeight: '1.2' }}>
                                        {cleanBankDetails || 'Please contact us for bank details.'}
                                    </div>
                                </div>
                            </div>
                        ) : !doc.document_type?.includes('QUOTATION') && (
                            <div style={{ 
                                border: styles.border, 
                                borderRadius: '10px', 
                                height: '100px', 
                                display: 'flex', 
                                flexDirection: 'column',
                                justifyContent: 'space-between',
                                overflow: 'hidden'
                            }}>
                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 10px' }}>
                                    <div style={{ ...styles.small, fontSize: '7px', color: '#94a3b8', fontStyle: 'italic' }}>
                                        {isDeliveryDoc ? 'RECEIVED IN GOOD ORDER' : isORA ? 'WE ACKNOWLEDGE YOUR ORDER' : 'WE AGREE TO SUPPLY AS PER THIS QUOTE'}
                                    </div>
                                </div>
                                <div style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0', padding: '2px 0' }}>
                                    <div style={{ ...styles.bodyBold, fontSize: '8px' }}>CUSTOMER ACKNOWLEDGMENT</div>
                                    <div style={{ ...styles.small, fontSize: '7px' }}>{doc.partners?.name}</div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Attachments / Second Page Provision */}
                {doc.attachments && doc.attachments.length > 0 && (
                    <div style={{ pageBreakBefore: 'always', paddingTop: '20px' }}>
                        <div style={{ ...styles.h3, borderBottom: '2px solid #1e3a8a', paddingBottom: '8px', marginBottom: '20px' }}>ATTACHMENT - 1: TECHNICAL PHOTOS / DATASHEETS</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                            {doc.attachments.map((img, idx) => (
                                <div key={idx} style={{ border: styles.border, borderRadius: '12px', padding: '10px', background: '#fff' }}>
                                    <img src={img} alt={`Attachment ${idx + 1}`} style={{ width: '100%', height: 'auto', borderRadius: '8px' }} />
                                    <div style={{ ...styles.small, marginTop: '8px', textAlign: 'center', color: '#64748b' }}>Technical Image {idx + 1}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div style={{ textAlign: 'center', borderTop: '1px solid #1e3a8a', paddingTop: '10px', marginTop: '20px' }}>
                    <div style={{ ...styles.h2, letterSpacing: '2px' }}>WWW.CELRON.NET</div>
                </div>
            </div>
        </div>
    );
};

export default WorkflowDocumentLayout;
