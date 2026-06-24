import React, { useState, useEffect, useRef } from 'react';
import { 
    X, Send, Users, Mail, CheckCircle2, Search, ArrowRight, Loader2,
    Folder, Paperclip, QrCode, MessageSquare, Trash2, Plus, Eye,
    Phone, FileText, ChevronDown, ChevronUp, RefreshCcw, Link2
} from 'lucide-react';
import { getPartners } from '../../lib/store';
import { listFolderContent } from '../../lib/driveService';

export default function FastFloatModal({ isOpen, onClose, onConfirm, enquiry }) {
    const [step, setStep] = useState(1); // 1=Select Suppliers, 2=Compose, 3=Done
    const [suppliers, setSuppliers] = useState([]);
    const [selectedSuppliers, setSelectedSuppliers] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [currentEmailIndex, setCurrentEmailIndex] = useState(0);
    const [emailDrafts, setEmailDrafts] = useState([]);
    const [sentCount, setSentCount] = useState(0);

    // Attachment states
    const [driveFiles, setDriveFiles] = useState([]);
    const [selectedAttachments, setSelectedAttachments] = useState([]);
    const [showDrivePanel, setShowDrivePanel] = useState(false);
    const [loadingDrive, setLoadingDrive] = useState(false);

    // QR state
    const [showQr, setShowQr] = useState(false);
    const [qrUrl, setQrUrl] = useState('');

    // Body editing
    const [editableBody, setEditableBody] = useState('');
    const [editableSubject, setEditableSubject] = useState('');

    const FROM_EMAIL = 'enquiry@celron.net';
    const BCC_EMAILS = 'celron.simlim0305@gmail.com,accounts@celron.net';

    useEffect(() => {
        if (isOpen) {
            fetchSuppliers();
            setStep(1);
            setSelectedSuppliers([]);
            setCurrentEmailIndex(0);
            setSentCount(0);
            setSelectedAttachments([]);
            setShowDrivePanel(false);
            setShowQr(false);
        }
    }, [isOpen]);

    const fetchSuppliers = async () => {
        setLoading(true);
        try {
            const data = await getPartners();
            const supps = (data || []).filter(p =>
                Array.isArray(p.types) &&
                (p.types.includes('Supplier') || p.types.includes('Service Provider'))
            );
            setSuppliers(supps);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const fetchDriveFiles = async () => {
        const folderId = enquiry?.gdrive_folder_id || enquiry?.gdrive_file_id;
        if (!folderId) return;
        const token = localStorage.getItem('google_access_token');
        if (!token) return;
        setLoadingDrive(true);
        try {
            const files = await listFolderContent(token, folderId);
            setDriveFiles(files || []);
        } catch (err) {
            console.error('Error loading drive files:', err);
        } finally {
            setLoadingDrive(false);
        }
    };

    // Build the formatted enquiry lines for email body
    const buildItemsList = () => {
        const items = enquiry?.catalog_items || enquiry?.enquiry_lines || [];
        if (items.length === 0 && enquiry?.description) {
            return enquiry.description.replace(/<[^>]*>/g, '').trim();
        }
        return items.map((it, idx) => {
            const desc = it.description || it.name || it.item || '';
            const qty = it.qty || it.quantity || '';
            const uom = it.unit || it.uom || 'pcs';
            const spec = it.spec || it.specifications || '';
            return `${idx + 1}. ${desc}${spec ? ` - ${spec}` : ''}${qty ? ` [Qty: ${qty} ${uom}]` : ''}`;
        }).join('\n');
    };

    const buildEmailBody = (supplier) => {
        const custRef = enquiry?.customer_ref || '';
        const enqNo = enquiry?.enquiry_no || '';
        const vessel = enquiry?.vessel_name || enquiry?.vessel || '';
        const dueDate = enquiry?.due_date ? new Date(enquiry.due_date).toLocaleDateString('en-GB') : 'ASAP';
        const itemsList = buildItemsList();
        const attLine = selectedAttachments.length > 0
            ? `\n\nAttachments noted (${selectedAttachments.length} file(s)):${selectedAttachments.map(f => `\n  - ${f.name}`).join('')}\n[Please request files via the link if needed]`
            : '';

        return `Dear ${supplier.name || 'Supplier'},

Please find our Request for Quotation (RFQ) as detailed below.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RFQ Ref     : ${enqNo}${custRef ? `\nCust. Ref   : ${custRef}` : ''}${vessel ? `\nVessel/Loc  : ${vessel}` : ''}
Required By : ${dueDate}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Items Required:
${itemsList}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Please provide:
  ✓ Unit Price & Total Price (SGD or your currency)
  ✓ Lead Time / Delivery Date
  ✓ Part Numbers & Brand (if applicable)
  ✓ Any technical specifications or alternatives${attLine}

Kindly reply to: ${FROM_EMAIL}

Best Regards,
Celron Marine & Engineering
enquiry@celron.net | +65 6123 4567
www.celron.net`;
    };

    const buildEmailSubject = () => {
        const enqNo = enquiry?.enquiry_no || '';
        const custRef = enquiry?.customer_ref || '';
        const vessel = enquiry?.vessel_name || enquiry?.vessel || '';
        const desc = enquiry?.subject || enquiry?.description?.replace(/<[^>]*>/g, '').trim().substring(0, 40) || '';
        return `RFQ: ${enqNo}${custRef ? ` | Ref: ${custRef}` : ''}${vessel ? ` | ${vessel}` : ''}${desc ? ` | ${desc}` : ''}`;
    };

    const handleNextStep = () => {
        if (selectedSuppliers.length === 0) {
            alert('Please select at least one supplier.');
            return;
        }
        const drafts = selectedSuppliers.map(s => ({
            supplier: s,
            to: s.email1 || s.email || '',
            subject: buildEmailSubject(),
            body: buildEmailBody(s)
        }));
        setEmailDrafts(drafts);
        setEditableBody(drafts[0]?.body || '');
        setEditableSubject(drafts[0]?.subject || '');
        setStep(2);
        setCurrentEmailIndex(0);
    };

    const handleSwitchEmail = (idx) => {
        setCurrentEmailIndex(idx);
        setEditableBody(emailDrafts[idx]?.body || '');
        setEditableSubject(emailDrafts[idx]?.subject || '');
    };

    const handleSendEmail = () => {
        const draft = emailDrafts[currentEmailIndex];
        const body = editableBody || draft.body;
        const subject = editableSubject || draft.subject;
        const mailto = `mailto:${draft.to}?from=${encodeURIComponent(FROM_EMAIL)}&bcc=${encodeURIComponent(BCC_EMAILS)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.open(mailto, '_blank');
        setSentCount(p => p + 1);

        if (currentEmailIndex < emailDrafts.length - 1) {
            handleSwitchEmail(currentEmailIndex + 1);
        }
    };

    const handleSendWhatsApp = () => {
        const draft = emailDrafts[currentEmailIndex];
        const s = draft.supplier;
        const phone = (s.phone1 || s.phone || '').replace(/[^0-9]/g, '');
        if (!phone) { alert('No phone number for this supplier.'); return; }
        const body = editableBody || draft.body;
        const waUrl = `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(body)}`;
        window.open(waUrl, '_blank');
        setSentCount(p => p + 1);
    };

    const handleGenerateQr = () => {
        const folderId = enquiry?.gdrive_folder_id || enquiry?.gdrive_file_id;
        if (!folderId) { alert('No Google Drive folder linked to this enquiry yet.'); return; }
        const driveLink = `https://drive.google.com/drive/folders/${folderId}`;
        const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(driveLink)}`;
        setQrUrl(qrApiUrl);
        setShowQr(true);
    };

    const handleFinish = () => {
        onConfirm && onConfirm(selectedSuppliers, sentCount);
    };

    if (!isOpen) return null;

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <div style={{ background: '#fff', width: '100%', maxWidth: '900px', borderRadius: '24px', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '92vh', boxShadow: '0 32px 64px -12px rgba(0,0,0,0.35)' }}>

                {/* Header */}
                <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(135deg, #f0f4ff 0%, #f8faff 100%)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={{ background: '#6366f1', padding: '10px', borderRadius: '12px', color: '#fff' }}>
                            <Send size={20} />
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#1e293b' }}>
                                Float RFQ to Suppliers
                            </h3>
                            <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>
                                {enquiry?.enquiry_no} {enquiry?.customer_ref ? `• ${enquiry.customer_ref}` : ''}
                                {step === 1 ? ' — Select suppliers' : step === 2 ? ' — Compose & Send' : ' — Completed'}
                            </p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {/* Step Indicator */}
                        {[1, 2].map(s => (
                            <div key={s} style={{ width: 28, height: 28, borderRadius: '50%', background: step >= s ? '#6366f1' : '#e2e8f0', color: step >= s ? '#fff' : '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.8rem', transition: 'all 0.2s' }}>
                                {s}
                            </div>
                        ))}
                        <button onClick={onClose} style={{ background: '#f1f5f9', border: 'none', color: '#64748b', cursor: 'pointer', borderRadius: '8px', padding: '8px', marginLeft: '6px', display: 'flex' }}><X size={20} /></button>
                    </div>
                </div>

                {/* Step 1: Select Suppliers */}
                {step === 1 && (
                    <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
                        {/* Enquiry Summary */}
                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px 16px', marginBottom: '20px', display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                            <div><div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ENQ No.</div><div style={{ fontWeight: 700, color: '#4f46e5', fontSize: '0.9rem' }}>{enquiry?.enquiry_no || '—'}</div></div>
                            <div><div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Customer</div><div style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.9rem' }}>{enquiry?.customer_name || enquiry?.customer || '—'}</div></div>
                            <div><div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Vessel/Loc</div><div style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.9rem' }}>{enquiry?.vessel_name || enquiry?.vessel || '—'}</div></div>
                            <div><div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Due Date</div><div style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.9rem' }}>{enquiry?.due_date ? new Date(enquiry.due_date).toLocaleDateString('en-GB') : 'ASAP'}</div></div>
                        </div>

                        {/* Attach from GDrive */}
                        <div style={{ marginBottom: '16px' }}>
                            <button onClick={() => { setShowDrivePanel(!showDrivePanel); if (!showDrivePanel) fetchDriveFiles(); }} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', borderRadius: '10px', border: '1px solid #c7d2fe', background: '#eef2ff', color: '#4f46e5', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}>
                                <Folder size={15} /> Attach from Drive Folder {selectedAttachments.length > 0 ? `(${selectedAttachments.length} selected)` : ''} {showDrivePanel ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                            </button>
                            {showDrivePanel && (
                                <div style={{ marginTop: '8px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0', padding: '12px', maxHeight: '160px', overflowY: 'auto' }}>
                                    {loadingDrive ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b' }}><Loader2 size={16} className="animate-spin" /> Loading files...</div>
                                    ) : driveFiles.length === 0 ? (
                                        <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.85rem' }}>No files in linked Drive folder. Link a folder to this enquiry first.</p>
                                    ) : driveFiles.map(f => {
                                        const isSel = selectedAttachments.some(a => a.id === f.id);
                                        return (
                                            <div key={f.id} onClick={() => setSelectedAttachments(isSel ? selectedAttachments.filter(a => a.id !== f.id) : [...selectedAttachments, f])}
                                                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '8px', cursor: 'pointer', background: isSel ? '#eef2ff' : 'transparent', marginBottom: '2px' }}>
                                                {isSel ? <CheckCircle2 size={15} color="#6366f1" /> : <FileText size={15} color="#94a3b8" />}
                                                <span style={{ fontSize: '0.82rem', color: isSel ? '#4f46e5' : '#475569', fontWeight: isSel ? 600 : 400 }}>{f.name}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* QR Transfer */}
                        <div style={{ marginBottom: '20px' }}>
                            <button onClick={handleGenerateQr} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', borderRadius: '10px', border: '1px solid #d1fae5', background: '#ecfdf5', color: '#059669', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}>
                                <QrCode size={15} /> QR Code — Mobile File Transfer
                            </button>
                            {showQr && qrUrl && (
                                <div style={{ marginTop: '10px', display: 'flex', alignItems: 'flex-start', gap: '16px', background: '#f0fdf4', borderRadius: '12px', padding: '16px', border: '1px solid #bbf7d0' }}>
                                    <img src={qrUrl} alt="QR Drive Link" style={{ width: 100, height: 100, borderRadius: '8px' }} />
                                    <div>
                                        <div style={{ fontWeight: 700, color: '#065f46', marginBottom: '4px' }}>Scan to open Enquiry Drive Folder on mobile</div>
                                        <div style={{ fontSize: '0.78rem', color: '#6b7280' }}>Use your phone's camera to scan. You can then upload photos/documents directly from your mobile into the enquiry folder before sending.</div>
                                        <button onClick={() => setShowQr(false)} style={{ marginTop: '8px', background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px' }}><X size={12} /> Close QR</button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Supplier Search */}
                        <div style={{ fontWeight: 700, color: '#374151', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Users size={16} color="#6366f1" /> Select Suppliers / Service Providers
                        </div>
                        <div style={{ position: 'relative', marginBottom: '14px' }}>
                            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                            <input type="text" placeholder="Search suppliers..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                                style={{ width: '100%', padding: '10px 12px 10px 36px', borderRadius: '10px', border: '1.5px solid #e2e8f0', fontSize: '0.9rem', boxSizing: 'border-box' }} />
                        </div>
                        {loading ? <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8' }}><Loader2 size={24} className="animate-spin" /></div> : (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                {suppliers.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase())).map(s => {
                                    const isSelected = selectedSuppliers.some(sel => sel.id === s.id);
                                    return (
                                        <div key={s.id} onClick={() => setSelectedSuppliers(isSelected ? selectedSuppliers.filter(sel => sel.id !== s.id) : [...selectedSuppliers, s])}
                                            style={{ padding: '14px 16px', borderRadius: '14px', border: '2px solid', borderColor: isSelected ? '#6366f1' : '#f1f5f9', background: isSelected ? '#eef2ff' : '#fafafa', cursor: 'pointer', transition: 'all 0.18s', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <div style={{ fontWeight: 700, color: isSelected ? '#3730a3' : '#1e293b', fontSize: '0.9rem' }}>{s.name}</div>
                                                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>{s.email1 || s.email || 'No email'}</div>
                                                {(s.phone1 || s.phone) && <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '1px', display: 'flex', alignItems: 'center', gap: '4px' }}><Phone size={10} />{s.phone1 || s.phone}</div>}
                                            </div>
                                            {isSelected && <CheckCircle2 size={20} color="#6366f1" />}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* Step 2: Compose & Review */}
                {step === 2 && (
                    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                        {/* Supplier tabs on left */}
                        <div style={{ width: '200px', background: '#f8fafc', borderRight: '1px solid #e2e8f0', overflowY: 'auto', padding: '16px 10px', flexShrink: 0 }}>
                            <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '10px', letterSpacing: '0.05em' }}>Recipients ({emailDrafts.length})</div>
                            {emailDrafts.map((d, i) => (
                                <div key={i} onClick={() => handleSwitchEmail(i)}
                                    style={{ padding: '10px', borderRadius: '10px', cursor: 'pointer', marginBottom: '4px', background: i === currentEmailIndex ? '#eef2ff' : 'transparent', border: i === currentEmailIndex ? '1.5px solid #c7d2fe' : '1.5px solid transparent', transition: 'all 0.15s' }}>
                                    <div style={{ fontWeight: 700, fontSize: '0.82rem', color: i === currentEmailIndex ? '#4f46e5' : '#374151' }}>{d.supplier.name.substring(0, 22)}</div>
                                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.to || 'No email'}</div>
                                </div>
                            ))}
                        </div>

                        {/* Email compose on right */}
                        <div style={{ flex: 1, padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {/* From */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <label style={{ fontWeight: 700, fontSize: '0.78rem', color: '#94a3b8', textTransform: 'uppercase', width: '60px', flexShrink: 0 }}>From</label>
                                <div style={{ padding: '8px 12px', background: '#f1f5f9', borderRadius: '8px', flex: 1, fontSize: '0.88rem', color: '#475569', fontWeight: 600 }}>
                                    {FROM_EMAIL}
                                </div>
                            </div>
                            {/* To */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <label style={{ fontWeight: 700, fontSize: '0.78rem', color: '#94a3b8', textTransform: 'uppercase', width: '60px', flexShrink: 0 }}>To</label>
                                <input value={emailDrafts[currentEmailIndex]?.to || ''} readOnly
                                    style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', flex: 1, fontSize: '0.88rem', color: '#1e293b', background: '#fff' }} />
                            </div>
                            {/* Subject */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <label style={{ fontWeight: 700, fontSize: '0.78rem', color: '#94a3b8', textTransform: 'uppercase', width: '60px', flexShrink: 0 }}>Subject</label>
                                <input value={editableSubject} onChange={e => setEditableSubject(e.target.value)}
                                    style={{ padding: '8px 12px', border: '1.5px solid #c7d2fe', borderRadius: '8px', flex: 1, fontSize: '0.88rem', color: '#1e293b', background: '#fff', fontWeight: 600 }} />
                            </div>
                            {/* Body */}
                            <div>
                                <label style={{ fontWeight: 700, fontSize: '0.78rem', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Message Body</label>
                                <textarea value={editableBody} onChange={e => setEditableBody(e.target.value)} rows={16}
                                    style={{ width: '100%', padding: '14px', border: '1.5px solid #e2e8f0', borderRadius: '12px', fontSize: '0.85rem', color: '#334155', lineHeight: 1.6, fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box' }} />
                            </div>

                            {/* Attachments reminder */}
                            {selectedAttachments.length > 0 && (
                                <div style={{ background: '#fef9c3', borderRadius: '10px', padding: '10px 14px', border: '1px solid #fde047' }}>
                                    <div style={{ fontWeight: 700, fontSize: '0.8rem', color: '#713f12', marginBottom: '4px' }}>📎 Files noted in email body ({selectedAttachments.length})</div>
                                    <div style={{ fontSize: '0.75rem', color: '#92400e' }}>Share the Drive folder link separately for the supplier to download.</div>
                                    {selectedAttachments.map(f => <div key={f.id} style={{ fontSize: '0.75rem', color: '#78350f', marginTop: '2px' }}>• {f.name}</div>)}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Footer */}
                <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '0.88rem', color: '#64748b', fontWeight: 600 }}>
                        {step === 1 ? `${selectedSuppliers.length} supplier(s) selected` : `${sentCount} of ${emailDrafts.length} sent — Supplier ${currentEmailIndex + 1}: ${emailDrafts[currentEmailIndex]?.supplier?.name || ''}`}
                    </div>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        {step === 2 && (
                            <>
                                <button onClick={() => setStep(1)} style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '10px 16px', borderRadius: '10px', fontWeight: 600, cursor: 'pointer', fontSize: '0.88rem' }}>
                                    ← Back
                                </button>
                                <button onClick={handleSendWhatsApp}
                                    style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0', padding: '10px 16px', borderRadius: '10px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.88rem' }}>
                                    <MessageSquare size={16} /> WhatsApp
                                </button>
                                <button onClick={handleSendEmail}
                                    style={{ background: '#6366f1', color: '#fff', border: 'none', padding: '10px 22px', borderRadius: '10px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.88rem' }}>
                                    <Mail size={16} />
                                    {currentEmailIndex < emailDrafts.length - 1 ? 'Send Email & Next' : 'Send Email'}
                                </button>
                                {sentCount > 0 && (
                                    <button onClick={handleFinish}
                                        style={{ background: '#10b981', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '10px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.88rem' }}>
                                        <CheckCircle2 size={16} /> Done ({sentCount} sent)
                                    </button>
                                )}
                            </>
                        )}
                        {step === 1 && (
                            <button onClick={handleNextStep}
                                style={{ background: '#6366f1', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: '10px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.88rem' }}>
                                Next: Compose Emails <ArrowRight size={18} />
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
