import React, { useState, useEffect } from 'react';
import { 
    X, Send, Users, Mail, CheckCircle2, Search, ArrowRight, Loader2,
    Folder, Paperclip, QrCode, MessageSquare, Trash2, Plus, Eye,
    Phone, FileText, ChevronDown, ChevronUp, RefreshCw, Link2, 
    Smartphone, Info, Edit2, FileCheck, ImageIcon, Upload
} from 'lucide-react';
import { getPartners } from '../../lib/store';
import { listFolderContent, getOrCreateFolder } from '../../lib/driveService';
import { getStoredToken } from '../../lib/googleAuthService';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import { Modal, QuickPartnerContactDualAdd } from '../workflow/QuickAddForms';

export default function FastFloatModal({ isOpen, onClose, onConfirm, enquiry }) {
    const [step, setStep] = useState(1); // 1=Select Suppliers, 2=Compose, 3=Done
    const [suppliers, setSuppliers] = useState([]);
    const [selectedSuppliers, setSelectedSuppliers] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(false);
    
    // Multi-draft state
    const [currentEmailIndex, setCurrentEmailIndex] = useState(0);
    const [emailDrafts, setEmailDrafts] = useState([]);
    const [sentCount, setSentCount] = useState(0);

    // Active draft compose states
    const [to, setTo] = useState('');
    const [cc, setCc] = useState('');
    const [bcc, setBcc] = useState('');
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [attachments, setAttachments] = useState([]); // List of File objects attached to current draft

    // Google Drive shared states
    const [driveConnected, setDriveConnected] = useState(false);
    const [loadingDriveFiles, setLoadingDriveFiles] = useState(false);
    const [activeAttachmentTab, setActiveAttachmentTab] = useState('supplierEnquiry');
    const [supplierEnquiryFiles, setSupplierEnquiryFiles] = useState([]);
    const [photosMediaFiles, setPhotosMediaFiles] = useState([]);
    const [quotationsReceivedFiles, setQuotationsReceivedFiles] = useState([]);
    const [photosFolderId, setPhotosFolderId] = useState(null);
    const [qrModal, setQrModal] = useState({ isOpen: false, folderId: null, folderName: '' });

    // Contact picker searches
    const [companySearch, setCompanySearch] = useState('');
    const [officeSearch, setOfficeSearch] = useState('');
    const [customVisibleContacts, setCustomVisibleContacts] = useState([]);
    const [customOfficeContacts, setCustomOfficeContacts] = useState([]);

    // Supplier CRUD states
    const [editingSupplier, setEditingSupplier] = useState(null);
    const [isAddingSupplier, setIsAddingSupplier] = useState(false);
    const [supplierForm, setSupplierForm] = useState({ name: '', email: '', phone: '' });

    const FROM_EMAIL = 'enquiry@celron.net';
    const defaultOfficeContacts = [
        { name: 'Our Office', email: 'accounts@celron.net', post: 'Billing / Finance' },
        { name: 'N.R.KUMAR', email: 'kumar@celron.net', post: 'Director', handphone: '+65 97685891' },
        { name: 'Sales Office', email: 'sales@celron.net', post: 'General Sales' }
    ];

    useEffect(() => {
        if (isOpen) {
            fetchSuppliers();
            setStep(1);
            setSelectedSuppliers([]);
            setCurrentEmailIndex(0);
            setSentCount(0);
            setSupplierEnquiryFiles([]);
            setPhotosMediaFiles([]);
            setQuotationsReceivedFiles([]);
            setPhotosFolderId(null);
            setQrModal({ isOpen: false, folderId: null, folderName: '' });
            setIsAddingSupplier(false);
            setEditingSupplier(null);
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
        if (!folderId) {
            console.log('[FastFloatModal] No enquiry folder ID linked.');
            return;
        }
        const token = getStoredToken();
        if (!token) {
            setDriveConnected(false);
            return;
        }

        setDriveConnected(true);
        setLoadingDriveFiles(true);
        try {
            const supplierUploadsId = await getOrCreateFolder(token, 'Supplier Enquiry uploads', folderId);
            const photosId = await getOrCreateFolder(token, 'Photos & Media', folderId);
            const quotationsId = await getOrCreateFolder(token, 'Quotations received', folderId);

            setPhotosFolderId(photosId);

            const supplierFiles = await listFolderContent(token, supplierUploadsId);
            const photoFiles = await listFolderContent(token, photosId);
            const quoteFiles = await listFolderContent(token, quotationsId);

            setSupplierEnquiryFiles(supplierFiles || []);
            setPhotosMediaFiles(photoFiles || []);
            setQuotationsReceivedFiles(quoteFiles || []);
        } catch (err) {
            console.error('[FastFloatModal] GDrive sync failed:', err);
            toast.error('Failed to sync Google Drive files.');
        } finally {
            setLoadingDriveFiles(false);
        }
    };

    // Trigger Drive files fetch on stepping into Step 2
    useEffect(() => {
        if (step === 2) {
            fetchDriveFiles();
        }
    }, [step]);

    // Download file from GDrive and attach it to the current draft
    const attachDriveFile = async (fileInfo) => {
        setLoading(true);
        try {
            const token = getStoredToken();
            if (!token) throw new Error('Drive connection lost. Reconnect.');

            const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileInfo.id}?alt=media`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Failed to retrieve file content');
            
            const blob = await response.blob();
            const file = new File([blob], fileInfo.name, { type: fileInfo.mimeType || 'application/octet-stream' });
            
            setAttachments(prev => [...prev, file]);
            toast.success(`Attached ${fileInfo.name}`);
        } catch (err) {
            console.error(err);
            toast.error('Failed to attach file: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const removeAttachment = (index) => {
        setAttachments(prev => prev.filter((_, i) => i !== index));
    };

    const handleFileChange = (e) => {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
            setAttachments(prev => [...prev, ...files]);
        }
        e.target.value = null; // reset
    };

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
        const itemsList = buildItemsList();
        const folderId = enquiry?.gdrive_folder_id || enquiry?.gdrive_file_id;
        const gdriveNote = folderId ? `You can view photos and additional attachments here: https://drive.google.com/drive/folders/${folderId}\n\n` : '';

        return `Dear ${supplier.name || 'Supplier'},

We are pleased to invite you to quote for the following items:

${itemsList}

${gdriveNote}Please revert with your best price and lead time at your earliest convenience.

Thank you,
N.R.KUMAR HP:+65 97685891
CELRON ENTERPRISES PTE LTD
10, Jln, Besar,"Sim Lim Tower", #03-05, Singapore 208787
Email: sales@celron.net | Tel: +6597685891/81962270 Web : https://www.celron.net    / https://celron.shop`;
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
            cc: 'accounts@celron.net; acct.celron.sg@gmail.com',
            bcc: 'celron.simlim0305@gmail.com',
            subject: buildEmailSubject(),
            body: buildEmailBody(s),
            attachments: []
        }));
        setEmailDrafts(drafts);
        
        // Load first draft
        const first = drafts[0];
        setTo(first.to);
        setCc(first.cc);
        setBcc(first.bcc);
        setSubject(first.subject);
        setBody(first.body);
        setAttachments(first.attachments);

        setStep(2);
        setCurrentEmailIndex(0);
    };

    const handleSwitchEmail = (idx) => {
        // Save current compose state back to previous draft
        if (emailDrafts[currentEmailIndex]) {
            setEmailDrafts(prev => {
                const copy = [...prev];
                copy[currentEmailIndex] = {
                    ...copy[currentEmailIndex],
                    to,
                    cc,
                    bcc,
                    subject,
                    body,
                    attachments
                };
                return copy;
            });
        }

        // Switch to new draft
        setCurrentEmailIndex(idx);
        const draft = emailDrafts[idx];
        setTo(draft.to || '');
        setCc(draft.cc || 'accounts@celron.net; acct.celron.sg@gmail.com');
        setBcc(draft.bcc || 'celron.simlim0305@gmail.com');
        setSubject(draft.subject || '');
        setBody(draft.body || '');
        setAttachments(draft.attachments || []);
    };

    const handleSendEmail = async () => {
        const recipientTo = to.trim();
        if (!recipientTo) {
            toast.error('To recipient address is required.');
            return;
        }

        setLoading(true);
        const apiUrl = `${import.meta.env.VITE_API_URL || ''}/api/send-email`;
        
        try {
            // Prepare attachments as base64 payload
            const customAttachments = await Promise.all(attachments.map(async (file) => {
                return new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = (e) => resolve({ name: file.name, type: file.type, content: e.target.result });
                    reader.readAsDataURL(file);
                });
            }));

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    company_id: enquiry?.company_id,
                    from_email: FROM_EMAIL,
                    to: recipientTo,
                    cc: cc,
                    bcc: bcc,
                    subject: subject,
                    body: body,
                    attachments: customAttachments
                })
            });

            if (!response.ok) throw new Error('API send error');

            toast.success(`RFQ sent to ${emailDrafts[currentEmailIndex]?.supplier?.name || 'supplier'}!`);
            setSentCount(p => p + 1);

            if (currentEmailIndex < emailDrafts.length - 1) {
                handleSwitchEmail(currentEmailIndex + 1);
            }
        } catch (err) {
            console.error(err);
            toast.error('Failed to send email: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSendWhatsApp = () => {
        const draft = emailDrafts[currentEmailIndex];
        const s = draft?.supplier;
        const phone = (s?.phone1 || s?.phone || '').replace(/[^0-9]/g, '');
        if (!phone) { alert('No phone number for this supplier.'); return; }
        const waUrl = `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(body)}`;
        window.open(waUrl, '_blank');
        setSentCount(p => p + 1);
    };

    const handleGenerateQr = () => {
        const folderId = enquiry?.gdrive_folder_id || enquiry?.gdrive_file_id;
        if (!folderId) { alert('No Google Drive folder linked to this enquiry.'); return; }
        setQrModal({ isOpen: true, folderId, folderName: 'Enquiry photos' });
    };

    const handleFinish = () => {
        onConfirm && onConfirm(selectedSuppliers, sentCount);
    };

    // Contacts pickers
    const getCompanyContacts = () => {
        const combined = [];
        const supplier = emailDrafts[currentEmailIndex]?.supplier;
        if (supplier) {
            // Fallback: Add the supplier's main email itself as a contact
            if (supplier.email1 && !combined.some(x => x.email.toLowerCase() === supplier.email1.toLowerCase())) {
                combined.push({
                    name: supplier.name,
                    email: supplier.email1,
                    post: 'Main Contact',
                    supplierName: supplier.name
                });
            }
        }
        customVisibleContacts.forEach(c => {
            if (c.email && !combined.some(x => x.email.toLowerCase() === c.email.toLowerCase())) {
                combined.push(c);
            }
        });
        return combined;
    };

    const getOfficeContacts = () => {
        const combined = [...defaultOfficeContacts];
        customOfficeContacts.forEach(c => {
            if (c.email && !combined.some(x => x.email.toLowerCase() === c.email.toLowerCase())) {
                combined.push(c);
            }
        });
        return combined;
    };

    const toggleEmailInField = (field, email) => {
        const currentVal = field === 'to' ? to : cc;
        let emails = currentVal ? currentVal.split(';').map(e => e.trim()).filter(e => e) : [];
        const lowerEmail = email.trim().toLowerCase();

        const matched = emails.find(e => e.toLowerCase() === lowerEmail);
        if (matched) {
            emails = emails.filter(e => e.toLowerCase() !== lowerEmail);
        } else {
            emails.push(email);
        }

        const finalVal = emails.join('; ');
        if (field === 'to') setTo(finalVal);
        else setCc(finalVal);
    };

    const filteredCompanyContacts = getCompanyContacts().filter(c => 
        (c.name || '').toLowerCase().includes(companySearch.toLowerCase()) || 
        (c.email || '').toLowerCase().includes(companySearch.toLowerCase())
    );

    const filteredOfficeContacts = getOfficeContacts().filter(c => 
        (c.name || '').toLowerCase().includes(officeSearch.toLowerCase()) || 
        (c.email || '').toLowerCase().includes(officeSearch.toLowerCase())
    );

    // Supplier CRUD handlers
    const handleAddSupplier = () => {
        setSupplierForm({ name: '', email: '', phone: '' });
        setIsAddingSupplier(true);
    };

    const handleEditSupplier = (supplier) => {
        setEditingSupplier(supplier);
        setSupplierForm({
            name: supplier.name || '',
            email: supplier.email1 || supplier.email || '',
            phone: supplier.phone1 || supplier.phone || ''
        });
    };

    const handleSaveSupplier = async () => {
        if (!supplierForm.name.trim()) {
            alert('Supplier Name is required.');
            return;
        }

        const payload = {
            name: supplierForm.name.trim(),
            email1: supplierForm.email.trim() || null,
            phone1: supplierForm.phone.trim() || null,
            updated_at: new Date().toISOString()
        };

        try {
            if (isAddingSupplier) {
                const { error } = await supabase.from('partners').insert([{
                    ...payload,
                    company_id: enquiry?.company_id,
                    types: ['Supplier']
                }]);
                if (error) throw error;
                toast.success('Supplier added!');
            } else if (editingSupplier) {
                const { error } = await supabase.from('partners').update(payload).eq('id', editingSupplier.id);
                if (error) throw error;
                toast.success('Supplier updated!');
            }
            setIsAddingSupplier(false);
            setEditingSupplier(null);
            fetchSuppliers();
        } catch (err) {
            console.error(err);
            alert('Failed to save supplier: ' + err.message);
        }
    };

    const handleDeleteSupplier = async (supplier) => {
        if (!window.confirm(`Delete supplier "${supplier.name}"?`)) return;
        try {
            const { error } = await supabase.from('partners').delete().eq('id', supplier.id);
            if (error) throw error;
            toast.success('Supplier deleted!');
            fetchSuppliers();
            setSelectedSuppliers(prev => prev.filter(sel => sel.id !== supplier.id));
        } catch (err) {
            console.error(err);
            alert('Failed to delete: ' + err.message);
        }
    };

    const getFileIcon = (mimeType) => {
        if (mimeType?.startsWith('image/')) return <ImageIcon size={16} color="#3b82f6" />;
        if (mimeType?.includes('pdf')) return <FileText size={16} color="#ef4444" />;
        return <Paperclip size={16} color="#64748b" />;
    };

    if (!isOpen) return null;

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <div style={{ background: '#fff', width: '100%', maxWidth: '1000px', borderRadius: '24px', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '95vh', boxShadow: '0 32px 64px -12px rgba(0,0,0,0.35)', position: 'relative' }}>

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
                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px 16px', marginBottom: '20px', display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                            <div><div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ENQ No.</div><div style={{ fontWeight: 700, color: '#4f46e5', fontSize: '0.9rem' }}>{enquiry?.enquiry_no || '—'}</div></div>
                            <div><div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Customer</div><div style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.9rem' }}>{enquiry?.customer_name || (typeof enquiry?.customer === 'object' ? enquiry?.customer?.name : enquiry?.customer) || '—'}</div></div>
                            <div><div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Vessel/Loc</div><div style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.9rem' }}>{enquiry?.vessel_name || enquiry?.vessel || '—'}</div></div>
                            <div><div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Due Date</div><div style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.9rem' }}>{enquiry?.due_date ? new Date(enquiry.due_date).toLocaleDateString('en-GB') : 'ASAP'}</div></div>
                        </div>

                        {/* Search & Add Header */}
                        <div style={{ fontWeight: 700, color: '#374151', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Users size={16} color="#6366f1" /> Select Suppliers / Service Providers
                            </div>
                            <button
                                onClick={handleAddSupplier}
                                style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: '8px', padding: '6px 12px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                            >
                                <Plus size={13} /> Add Supplier
                            </button>
                        </div>

                        <div style={{ position: 'relative', marginBottom: '14px' }}>
                            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                            <input type="text" placeholder="Search suppliers..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                                style={{ width: '100%', padding: '10px 12px 10px 36px', borderRadius: '10px', border: '1.5px solid #e2e8f0', fontSize: '0.9rem', boxSizing: 'border-box' }} />
                        </div>

                        {loading ? <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8' }}><Loader2 size={24} className="animate-spin" /></div> : (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                {suppliers.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase())).map(s => {
                                    const isSelected = selectedSuppliers.some(sel => sel.id === s.id);
                                    return (
                                        <div key={s.id} onClick={() => setSelectedSuppliers(isSelected ? selectedSuppliers.filter(sel => sel.id !== s.id) : [...selectedSuppliers, s])}
                                            style={{ padding: '14px 16px', borderRadius: '14px', border: '2px solid', borderColor: isSelected ? '#6366f1' : '#f1f5f9', background: isSelected ? '#eef2ff' : '#fafafa', cursor: 'pointer', transition: 'all 0.18s', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{ flex: 1, minWidth: 0, marginRight: '10px' }}>
                                                <div style={{ fontWeight: 700, color: isSelected ? '#3730a3' : '#1e293b', fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div>
                                                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.email1 || s.email || 'No email'}</div>
                                                {(s.phone1 || s.phone) && <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '1px', display: 'flex', alignItems: 'center', gap: '4px' }}><Phone size={10} />{s.phone1 || s.phone}</div>}
                                            </div>
                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                {isSelected && <CheckCircle2 size={18} color="#6366f1" style={{ marginRight: '6px' }} />}
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleEditSupplier(s); }}
                                                    style={{ background: '#f1f5f9', border: 'none', borderRadius: '6px', padding: '6px', cursor: 'pointer', color: '#4f46e5', display: 'flex' }}
                                                    title="Edit Supplier"
                                                >
                                                    <Edit2 size={13} />
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleDeleteSupplier(s); }}
                                                    style={{ background: '#fff1f2', border: 'none', borderRadius: '6px', padding: '6px', cursor: 'pointer', color: '#dc2626', display: 'flex' }}
                                                    title="Delete Supplier"
                                                >
                                                    <Trash2 size={13} />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* Step 2: Compose & Review (Upgraded layout with contacts pickers and tabs attachments) */}
                {step === 2 && (
                    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                        {/* Supplier tabs on left */}
                        <div style={{ width: '200px', background: '#f8fafc', borderRight: '1px solid #e2e8f0', overflowY: 'auto', padding: '16px 10px', flexShrink: 0 }}>
                            <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '10px', letterSpacing: '0.05em' }}>Recipients ({emailDrafts.length})</div>
                            {emailDrafts.map((d, i) => (
                                <div key={i} onClick={() => handleSwitchEmail(i)}
                                    style={{ padding: '10px', borderRadius: '10px', cursor: 'pointer', marginBottom: '4px', background: i === currentEmailIndex ? '#eef2ff' : 'transparent', border: i === currentEmailIndex ? '1.5px solid #c7d2fe' : '1.5px solid transparent', transition: 'all 0.15s' }}>
                                    <div style={{ fontWeight: 700, fontSize: '0.82rem', color: i === currentEmailIndex ? '#4f46e5' : '#374151', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.supplier.name}</div>
                                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.to || 'No email'}</div>
                                </div>
                            ))}
                        </div>

                        {/* Rich email composer layout same like image3 */}
                        <div style={{ flex: 1, padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {/* To / Cc / Bcc fields */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>To (Supplier Email)</label>
                                    <input type="text" style={{ width: '100%', padding: '10px 14px', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none', fontSize: '14px', boxSizing: 'border-box' }}
                                        value={to} onChange={(e) => setTo(e.target.value)} placeholder="supplier@example.com" />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cc</label>
                                        <input type="text" style={{ width: '100%', padding: '10px 14px', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none', fontSize: '14px', boxSizing: 'border-box' }}
                                            value={cc} onChange={(e) => setCc(e.target.value)} />
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Bcc</label>
                                        <input type="text" style={{ width: '100%', padding: '10px 14px', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none', fontSize: '14px', boxSizing: 'border-box' }}
                                            value={bcc} onChange={(e) => setBcc(e.target.value)} />
                                    </div>
                                </div>
                            </div>

                            {/* Dual Column Contact Picker (image3) */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                {/* Company Contacts */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <label style={{ fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Company Contacts</label>
                                    <div style={{ position: 'relative' }}>
                                        <input type="text" placeholder="Search company contacts..." value={companySearch} onChange={(e) => setCompanySearch(e.target.value)}
                                            style={{ width: '100%', padding: '8px 12px 8px 30px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }} />
                                        <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '11px' }} />
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '140px', overflowY: 'auto' }}>
                                        {filteredCompanyContacts.length === 0 ? (
                                            <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '11px', border: '1px dashed #cbd5e1', borderRadius: '8px', background: '#fff' }}>No contacts found</div>
                                        ) : (
                                            filteredCompanyContacts.map((contact, idx) => (
                                                <ContactCard key={idx} contact={contact} to={to} cc={cc} toggleEmailInField={toggleEmailInField} />
                                            ))
                                        )}
                                    </div>
                                </div>

                                {/* Our Office Contacts */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderLeft: '1px solid #e2e8f0', paddingLeft: '20px' }}>
                                    <label style={{ fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Our Office Contacts</label>
                                    <div style={{ position: 'relative' }}>
                                        <input type="text" placeholder="Search office contacts..." value={officeSearch} onChange={(e) => setOfficeSearch(e.target.value)}
                                            style={{ width: '100%', padding: '8px 12px 8px 30px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }} />
                                        <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '11px' }} />
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '140px', overflowY: 'auto' }}>
                                        {filteredOfficeContacts.map((contact, idx) => (
                                            <ContactCard key={idx} contact={contact} to={to} cc={cc} toggleEmailInField={toggleEmailInField} />
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Subject */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Subject</label>
                                <input type="text" style={{ width: '100%', padding: '10px 14px', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none', fontSize: '14px', boxSizing: 'border-box' }}
                                    value={subject} onChange={(e) => setSubject(e.target.value)} />
                            </div>

                            {/* Message Body */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Message Body</label>
                                <textarea style={{ width: '100%', minHeight: '160px', padding: '14px', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none', resize: 'vertical', fontFamily: 'monospace', fontSize: '13px', lineHeight: '1.5', boxSizing: 'border-box' }}
                                    value={body} onChange={(e) => setBody(e.target.value)} />
                            </div>

                            {/* 1:1 Attachments Component (image4) */}
                            <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', background: '#fff', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Paperclip size={18} color="#6366f1" />
                                        <span style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>Attach Files</span>
                                        {loadingDriveFiles && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#64748b' }}>
                                                <Loader2 size={12} className="animate-spin" />
                                                <span>Syncing Drive...</span>
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                        <button type="button" onClick={() => window.open(`https://drive.google.com/drive/folders/${enquiry?.gdrive_folder_id}`, '_blank')}
                                            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '6px 12px', fontSize: '11px', fontWeight: 600, color: '#475569', cursor: 'pointer' }}>
                                            Open Enquiry Drive
                                        </button>
                                        {driveConnected && (
                                            <button type="button" onClick={() => setQrModal({ isOpen: true, folderId: photosFolderId, folderName: 'Photos & Media' })}
                                                style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '6px 12px', fontSize: '11px', fontWeight: 600, color: '#166534', cursor: 'pointer' }}>
                                                <Smartphone size={12} /> Mobile Upload (QR)
                                            </button>
                                        )}
                                        {driveConnected && (
                                            <button type="button" onClick={fetchDriveFiles}
                                                style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '6px 12px', fontSize: '11px', fontWeight: 600, color: '#475569', cursor: 'pointer' }}>
                                                <RefreshCw size={12} className={loadingDriveFiles ? 'animate-spin' : ''} /> Refresh Drive
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', borderBottom: '1px solid #cbd5e1', paddingBottom: '1px' }}>
                                    {[
                                        { id: 'supplierEnquiry', name: 'Worksuite Docs', count: supplierEnquiryFiles.length },
                                        { id: 'photosMedia', name: 'Photos', count: photosMediaFiles.length },
                                        { id: 'quotationsReceived', name: 'Support Docs', count: quotationsReceivedFiles.length }
                                    ].map(tab => {
                                        const isActive = activeAttachmentTab === tab.id;
                                        return (
                                            <button key={tab.id} type="button" onClick={() => setActiveAttachmentTab(tab.id)}
                                                style={{ padding: '8px 12px', fontSize: '12px', fontWeight: 600, border: 'none', background: isActive ? '#f1f5f9' : 'transparent', color: isActive ? '#6366f1' : '#64748b', borderBottom: isActive ? '2px solid #6366f1' : '2px solid transparent', borderRadius: '6px 6px 0 0', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
                                                {tab.name}
                                                <span style={{ fontSize: '10px', background: isActive ? '#eef2ff' : '#f1f5f9', color: isActive ? '#6366f1' : '#64748b', padding: '1px 6px', borderRadius: '10px' }}>{tab.count}</span>
                                            </button>
                                        );
                                    })}
                                </div>

                                <div style={{ minHeight: '100px', maxHeight: '160px', overflowY: 'auto', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px' }}>
                                    {!driveConnected ? (
                                        <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8', fontSize: '11px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                                            <span>Google Drive is not connected.</span>
                                            <button type="button" onClick={async () => { const { connectGoogleAPI } = await import('../../lib/googleAuthService'); connectGoogleAPI(); }}
                                                style={{ padding: '4px 10px', fontSize: '11px', fontWeight: 600, background: '#6366f1', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Connect Drive</button>
                                        </div>
                                    ) : loadingDriveFiles ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '80px', gap: '8px', color: '#64748b' }}>
                                            <Loader2 size={20} className="animate-spin" />
                                            <span style={{ fontSize: '11px' }}>Loading files from Google Drive...</span>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            {(() => {
                                                const currentFiles = activeAttachmentTab === 'supplierEnquiry' ? supplierEnquiryFiles 
                                                                  : activeAttachmentTab === 'photosMedia' ? photosMediaFiles 
                                                                  : quotationsReceivedFiles;

                                                if (currentFiles.length === 0) {
                                                    return <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8', fontSize: '11px' }}>No files found in this folder.</div>;
                                                }

                                                return currentFiles.map(file => {
                                                    const isAttached = attachments.some(a => a.name === file.name);
                                                    return (
                                                        <div key={file.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: '#fff', border: '1px solid #f1f5f9', borderRadius: '6px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', flex: 1 }}>
                                                                {getFileIcon(file.mimeType)}
                                                                <span style={{ fontSize: '12px', fontWeight: 500, color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</span>
                                                            </div>
                                                            {isAttached ? (
                                                                <span style={{ fontSize: '11px', fontWeight: 600, color: '#10b981', display: 'flex', alignItems: 'center', gap: '3px' }}><FileCheck size={13} /> Attached</span>
                                                            ) : (
                                                                <button type="button" onClick={() => attachDriveFile(file)}
                                                                    style={{ padding: '3px 8px', fontSize: '11px', fontWeight: 600, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#2563eb', borderRadius: '4px', cursor: 'pointer' }}>+ Attach</button>
                                                            )}
                                                        </div>
                                                    );
                                                });
                                            })()}
                                        </div>
                                    )}
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Upload Local Files</span>
                                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', background: '#6366f1', color: '#fff', padding: '6px 14px', borderRadius: '6px', fontSize: '11px', fontWeight: 700 }}>
                                        <Upload size={13} /> + Add File
                                        <input type="file" multiple onChange={handleFileChange} style={{ display: 'none' }} />
                                    </label>
                                </div>

                                {attachments.length > 0 && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
                                        <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Currently Attached ({attachments.length})</label>
                                        {attachments.map((file, idx) => (
                                            <div key={idx} style={{ background: '#f8fafc', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                                    <Paperclip size={15} color="#64748b" />
                                                    <span style={{ fontSize: '12px', color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</span>
                                                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>({Math.round(file.size / 1024)} KB)</span>
                                                </div>
                                                <button type="button" onClick={() => removeAttachment(idx)}
                                                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px', display: 'flex' }}><Trash2 size={14} /></button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
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
                                <button onClick={() => setStep(1)} style={{ background: '#fff', border: '1px solid #cbd5e1', padding: '10px 16px', borderRadius: '10px', fontWeight: 600, cursor: 'pointer', fontSize: '0.88rem' }}>
                                    ← Back
                                </button>
                                <button onClick={handleSendWhatsApp}
                                    style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0', padding: '10px 16px', borderRadius: '10px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.88rem' }}>
                                    <MessageSquare size={16} /> WhatsApp
                                </button>
                                <button onClick={handleSendEmail} disabled={loading}
                                    style={{ background: '#6366f1', color: '#fff', border: 'none', padding: '10px 22px', borderRadius: '10px', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.88rem' }}>
                                    <Mail size={16} />
                                    {loading ? 'Sending...' : currentEmailIndex < emailDrafts.length - 1 ? 'Send Email & Next' : 'Send Email'}
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

                {/* Supplier Add/Edit Form Overlay (Image 4 / QuickPartnerContactDualAdd style) */}
                <Modal 
                    isOpen={isAddingSupplier || !!editingSupplier} 
                    onClose={() => { setIsAddingSupplier(false); setEditingSupplier(null); }}
                    title={editingSupplier ? "Edit Supplier Details" : "Add New Supplier"}
                    icon={Users}
                    size="xl"
                >
                    <QuickPartnerContactDualAdd 
                        company_id={enquiry?.company_id}
                        initialPartner={editingSupplier || { types: ['Supplier'] }}
                        partners={suppliers}
                        onSuccess={async ({ partner, contact }) => {
                            toast.success(editingSupplier ? 'Supplier updated successfully!' : 'Supplier added successfully!');
                            setIsAddingSupplier(false);
                            setEditingSupplier(null);
                            await fetchSuppliers();
                        }}
                        onCancel={() => {
                            setIsAddingSupplier(false);
                            setEditingSupplier(null);
                        }}
                        title={editingSupplier ? "Edit Supplier Details" : "Add New Supplier"}
                        defaultType="Supplier"
                    />
                </Modal>

                {/* Mobile Upload QR Modal Overlay */}
                {qrModal.isOpen && (
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3500, padding: '20px' }}>
                        <div style={{ background: '#fff', color: '#1e293b', maxWidth: '380px', width: '100%', padding: '28px', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.15)', textAlign: 'center', position: 'relative' }}>
                            <button type="button" onClick={() => setQrModal({ isOpen: false, folderId: null, folderName: '' })}
                                style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}>
                                <X size={20} />
                            </button>
                            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#ecfdf5', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                                <Smartphone size={20} />
                            </div>
                            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', marginBottom: '8px' }}>Mobile Upload Gateway</h3>
                            <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '20px', lineHeight: '1.4' }}>
                                Scan this QR code with your smartphone camera to upload files directly to your <strong>{qrModal.folderName}</strong> folder.
                            </p>
                            {!qrModal.folderId ? (
                                <div style={{ padding: '30px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                                    <Loader2 size={30} className="animate-spin text-primary" />
                                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Connecting Google Drive...</span>
                                </div>
                            ) : (
                                <div>
                                    <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '16px', border: '1px dashed #cbd5e1', display: 'inline-block', marginBottom: '16px' }}>
                                        <img src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(`${window.location.origin}/upload-media?folderId=${qrModal.folderId}&token=${getStoredToken() || localStorage.getItem('google_access_token')}&jobName=${encodeURIComponent(qrModal.folderName)}`)}`}
                                            alt="Upload QR Code" style={{ width: '180px', height: '180px', display: 'block' }} />
                                    </div>
                                    <div style={{ fontSize: '0.78rem', color: '#94a3b8', background: '#f8fafc', padding: '8px 10px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
                                        <Info size={12} style={{ flexShrink: 0 }} />
                                        <span>Session active. QR code is valid for temporary uploading.</span>
                                    </div>
                                </div>
                            )}
                            <button type="button" style={{ width: '100%', marginTop: '20px', padding: '10px', borderRadius: '10px', fontWeight: 700, background: '#6366f1', border: 'none', color: '#fff', cursor: 'pointer' }}
                                onClick={() => setQrModal({ isOpen: false, folderId: null, folderName: '' })}>Done</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// Inner helper component for Contact Card
function ContactCard({ contact, to, cc, toggleEmailInField }) {
    const contactEmail = (contact.email || '').trim().toLowerCase();
    const isToActive = contactEmail ? to.split(';').map(e => e.trim().toLowerCase()).includes(contactEmail) : false;
    const isCcActive = contactEmail ? cc.split(';').map(e => e.trim().toLowerCase()).includes(contactEmail) : false;

    return (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '6px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)', minWidth: '220px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={contact.name}>{contact.name}</span>
                <span style={{ fontSize: '10px', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={contact.email || 'No email registered'}>{contact.email || 'No email registered'}</span>
                {contact.supplierName && <span style={{ fontSize: '9px', fontWeight: 600, color: '#6366f1', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{contact.supplierName}</span>}
            </div>
            
            <div style={{ display: 'flex', gap: '5px', borderLeft: '1px solid #f1f5f9', paddingLeft: '8px', alignItems: 'center' }}>
                {contact.email && (
                    <>
                        <button type="button" onClick={() => toggleEmailInField('to', contact.email)}
                            style={{ background: isToActive ? '#eef2ff' : '#f8fafc', color: isToActive ? '#4f46e5' : '#64748b', border: `1px solid ${isToActive ? '#c7d2fe' : '#e2e8f0'}`, borderRadius: '4px', padding: '2px 8px', fontSize: '10px', fontWeight: 800, cursor: 'pointer', transition: 'all 0.15s ease-in-out' }}>To</button>
                        <button type="button" onClick={() => toggleEmailInField('cc', contact.email)}
                            style={{ background: isCcActive ? '#f0fdf4' : '#f8fafc', color: isCcActive ? '#16a34a' : '#64748b', border: `1px solid ${isCcActive ? '#bbf7d0' : '#e2e8f0'}`, borderRadius: '4px', padding: '2px 8px', fontSize: '10px', fontWeight: 800, cursor: 'pointer', transition: 'all 0.15s ease-in-out' }}>Cc</button>
                    </>
                )}
            </div>
        </div>
    );
}
