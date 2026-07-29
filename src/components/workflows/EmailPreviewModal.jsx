import React, { useState, useEffect } from 'react';
import { X, Send, Mail, Search, Paperclip, Trash2, Plus, Eye, Edit2, Upload, AlertCircle, CheckCircle2, FolderOpen, RefreshCw, FileText, ImageIcon, Loader2, FileCheck, Smartphone, Info, UploadCloud } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { getStoredToken } from '../../lib/googleAuthService';
import { listFolderContent, getOrCreateFolder, uploadFileToDrive } from '../../lib/driveService';
import toast from 'react-hot-toast';
import SmartAttachmentDropzone from '../common/SmartAttachmentDropzone';

export default function EmailPreviewModal({ isOpen, onClose, onSent, data }) {
    if (!isOpen) return null;

    const { profile } = useAuth();

    // Form inputs state
    const [to, setTo] = useState(data.to || '');
    const [cc, setCc] = useState(data.cc || 'accounts@celron.net; acct.celron.sg@gmail.com');
    const [bcc, setBcc] = useState(data.bcc || 'celron.simlim0305@gmail.com');
    const [subject, setSubject] = useState(data.subject || '');
    const [body, setBody] = useState(data.body || '');
    const [attachments, setAttachments] = useState(data.attachments || []);
    
    // Contact list state
    const [companySearch, setCompanySearch] = useState('');
    const [officeSearch, setOfficeSearch] = useState('');
    const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);
    const [showOfficeDropdown, setShowOfficeDropdown] = useState(false);
    const [customVisibleContacts, setCustomVisibleContacts] = useState([]);
    const [customOfficeContacts, setCustomOfficeContacts] = useState([]);
    const [saving, setSaving] = useState(false);

    // Google Drive attachment integration states
    const [loadingDriveFiles, setLoadingDriveFiles] = useState(false);
    const [driveConnected, setDriveConnected] = useState(false);
    const [activeAttachmentTab, setActiveAttachmentTab] = useState('supplierEnquiry');
    
    // Files inside the subfolders
    const [supplierEnquiryFiles, setSupplierEnquiryFiles] = useState([]);
    const [photosMediaFiles, setPhotosMediaFiles] = useState([]);
    const [quotationsReceivedFiles, setQuotationsReceivedFiles] = useState([]);

    const [supplierUploadsFolderId, setSupplierUploadsFolderId] = useState(null);
    const [photosFolderId, setPhotosFolderId] = useState(null);
    const [quotationsFolderId, setQuotationsFolderId] = useState(null);
    const [qrModal, setQrModal] = useState({ isOpen: false, folderId: null, folderName: '' });

    // Hardcoded office contact defaults
    const defaultOfficeContacts = [
        { name: 'Our Office', email: 'accounts@celron.net', post: 'Billing / Finance' },
        { name: 'N.R.KUMAR', email: 'kumar@celron.net', post: 'Director', handphone: '+65 97685891' },
        { name: 'Sales Office', email: 'sales@celron.net', post: 'General Sales' }
    ];

    // Fetch subfolder files from Google Drive
    const fetchDriveFiles = async () => {
        if (!data.enquiryFolderId) {
            console.log('[EmailPreviewModal] No enquiryFolderId provided.');
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
            console.log('[EmailPreviewModal] Fetching files from subfolders in parent folder:', data.enquiryFolderId);

            // 1. Get/create subfolder IDs inside data.enquiryFolderId
            const supplierUploadsId = await getOrCreateFolder(token, 'Supplier Enquiry uploads', data.enquiryFolderId);
            setSupplierUploadsFolderId(supplierUploadsId);
            
            const photosId = await getOrCreateFolder(token, 'Photos & Media', data.enquiryFolderId);
            setPhotosFolderId(photosId);

            const quotationsId = await getOrCreateFolder(token, 'Quotations received', data.enquiryFolderId);
            setQuotationsFolderId(quotationsId);

            // 2. Fetch file contents for each subfolder
            const supplierFiles = await listFolderContent(token, supplierUploadsId);
            const photoFiles = await listFolderContent(token, photosId);
            const quoteFiles = await listFolderContent(token, quotationsId);

            setSupplierEnquiryFiles(supplierFiles || []);
            setPhotosMediaFiles(photoFiles || []);
            setQuotationsReceivedFiles(quoteFiles || []);
        } catch (err) {
            console.error('[EmailPreviewModal] Error fetching Google Drive attachments:', err);
            toast.error('Failed to sync Google Drive files.');
        } finally {
            setLoadingDriveFiles(false);
        }
    };

    // Save copy of current attachments/document directly to Google Drive & refresh
    const [savingToDrive, setSavingToDrive] = useState(false);

    const handleSaveToDrive = async () => {
        if (!data.enquiryFolderId) {
            toast.error('No Google Drive folder linked to this project.');
            return;
        }

        const token = getStoredToken();
        if (!token) {
            toast.error('Google Drive is not connected. Connect Google Drive first.');
            return;
        }

        setSavingToDrive(true);
        try {
            // 1. Get active target subfolder ID
            let targetFolderId = activeAttachmentTab === 'supplierEnquiry' ? supplierUploadsFolderId :
                                 activeAttachmentTab === 'photosMedia' ? photosFolderId : quotationsFolderId;

            if (!targetFolderId) {
                const folderName = activeAttachmentTab === 'supplierEnquiry' ? 'Supplier Enquiry uploads' :
                                   activeAttachmentTab === 'photosMedia' ? 'Photos & Media' : 'Quotations received';
                targetFolderId = await getOrCreateFolder(token, folderName, data.enquiryFolderId);
            }

            // 2. Execute custom save handler if provided or upload local attachment files
            if (data.onSaveToDrive) {
                await data.onSaveToDrive(targetFolderId);
            } else if (attachments && attachments.length > 0) {
                for (const file of attachments) {
                    if (file instanceof File || file instanceof Blob) {
                        await uploadFileToDrive(token, file, file.name, targetFolderId);
                    }
                }
                toast.success('Attached document files uploaded to Google Drive!');
            } else {
                toast.error('No attached file available to save to Google Drive.');
                setSavingToDrive(false);
                return;
            }

            // 3. Re-fetch drive files to immediately update tab counts & file lists
            await fetchDriveFiles();
            toast.success('Google Drive attachments synced successfully!');
        } catch (err) {
            console.error('[SaveToDrive Error]:', err);
            toast.error('Failed to save to Google Drive: ' + (err.message || 'Drive API error'));
        } finally {
            setSavingToDrive(false);
        }
    };

    // Trigger Drive files fetch on load
    useEffect(() => {
        if (isOpen && data.enquiryFolderId) {
            fetchDriveFiles();
        }
    }, [isOpen, data.enquiryFolderId]);

    // Download Google Drive file content and attach to preview state
    const attachDriveFile = async (fileInfo) => {
        if (saving) return;
        setSaving(true);
        try {
            const token = getStoredToken();
            if (!token) throw new Error('Google Drive token expired or missing. Connect Drive first.');

            console.log('[EmailPreviewModal] Downloading file from GDrive:', fileInfo.name);
            const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileInfo.id}?alt=media`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Failed to retrieve file content from Google Drive');
            
            const blob = await response.blob();
            const file = new File([blob], fileInfo.name, { type: fileInfo.mimeType || 'application/octet-stream' });
            
            setAttachments(prev => [...prev, file]);
            toast.success(`Attached ${fileInfo.name}`);
        } catch (err) {
            console.error('[EmailPreviewModal] GDrive attachment failed:', err);
            toast.error('Failed to attach Google Drive file: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    // File icons helper
    const getFileIcon = (mimeType) => {
        if (mimeType?.startsWith('image/')) {
            return <ImageIcon size={16} color="#3b82f6" />;
        }
        if (mimeType?.includes('pdf')) {
            return <FileText size={16} color="#ef4444" />;
        }
        if (mimeType?.includes('spreadsheet') || mimeType?.includes('excel') || mimeType?.includes('csv')) {
            return <FileText size={16} color="#10b981" />;
        }
        return <Paperclip size={16} color="#64748b" />;
    };

    // Build contacts for selected suppliers
    const getCompanyContacts = () => {
        const combined = [];
        
        // Accumulate contacts from selected suppliers passed via data
        if (data.selectedSuppliers && data.supplierContacts) {
            data.selectedSuppliers.forEach(supplier => {
                const contactsList = data.supplierContacts[supplier.id] || [];
                contactsList.forEach(c => {
                    if (c.email && !combined.some(x => x.email.toLowerCase() === c.email.toLowerCase())) {
                        combined.push({
                            ...c,
                            supplierName: supplier.name
                        });
                    }
                });
                
                // Fallback: Add the supplier's main email itself as a contact if no contacts exist
                if (supplier.email1 && !combined.some(x => x.email.toLowerCase() === supplier.email1.toLowerCase())) {
                    combined.push({
                        name: supplier.name,
                        email: supplier.email1,
                        post: 'Main Contact',
                        supplierName: supplier.name
                    });
                }
            });
        }

        // Add custom added ones
        customVisibleContacts.forEach(c => {
            if (c.email && !combined.some(x => x.email.toLowerCase() === c.email.toLowerCase())) {
                combined.push(c);
            }
        });

        return combined;
    };

    // Get office contacts (default + custom)
    const getOfficeContacts = () => {
        const combined = [...defaultOfficeContacts];
        customOfficeContacts.forEach(c => {
            if (c.email && !combined.some(x => x.email.toLowerCase() === c.email.toLowerCase())) {
                combined.push(c);
            }
        });
        return combined;
    };

    // Filter contacts based on search query
    const filteredCompanyContacts = getCompanyContacts().filter(c => 
        (c.name || '').toLowerCase().includes(companySearch.toLowerCase()) || 
        (c.email || '').toLowerCase().includes(companySearch.toLowerCase()) ||
        (c.supplierName || '').toLowerCase().includes(companySearch.toLowerCase())
    );

    const filteredOfficeContacts = getOfficeContacts().filter(c => 
        (c.name || '').toLowerCase().includes(officeSearch.toLowerCase()) || 
        (c.email || '').toLowerCase().includes(officeSearch.toLowerCase())
    );

    // Toggle emails helper
    const toggleEmailInField = (field, email) => {
        if (!email) return;
        const currentVal = field === 'to' ? to : field === 'cc' ? cc : bcc;
        let emails = currentVal.split(';').map(e => e.trim()).filter(Boolean);
        const lowerEmail = email.trim().toLowerCase();
        
        const matched = emails.find(e => e.toLowerCase() === lowerEmail);
        if (matched) {
            emails = emails.filter(e => e.toLowerCase() !== lowerEmail);
        } else {
            emails.push(email);
        }

        const finalVal = emails.join('; ');
        if (field === 'to') setTo(finalVal);
        else if (field === 'cc') setCc(finalVal);
        else setBcc(finalVal);
    };

    // Local file attachment handler
    const handleFileChange = (e) => {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
            setAttachments(prev => [...prev, ...files]);
        }
        e.target.value = null; // reset
    };

    const removeAttachment = (index) => {
        setAttachments(prev => prev.filter((_, i) => i !== index));
    };

    // Send Email now
    const handleSendEmail = async () => {
        const recipientTo = to.trim();
        if (!recipientTo) {
            toast.error('Please enter a recipient email address in the "To" field before sending.');
            return;
        }

        setSaving(true);
        const apiUrl = `${import.meta.env.VITE_API_URL || ''}/api/send-email`;
        console.log('[Email] Sending RFQ email to:', recipientTo);

        try {
            // Convert attachments to base64 payload
            const customAttachments = await Promise.all(attachments.map(async (file) => {
                return new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = (e) => resolve({ name: file.name, type: file.type, content: e.target.result });
                    reader.readAsDataURL(file);
                });
            }));

            // Fallback from email from settings/auth
            const fromEmail = 'sales@celron.net';

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 35000);

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal,
                body: JSON.stringify({
                    company_id: profile?.company_id,
                    from_email: fromEmail,
                    to: recipientTo,
                    cc: cc,
                    bcc: bcc,
                    subject: subject,
                    body: body,
                    attachments: customAttachments,
                    in_reply_to: data.inReplyTo || data.messageId || '',
                    references: data.references || data.inReplyTo || data.messageId || ''
                })
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(errText || `Server returned ${response.status}`);
            }

            toast.success('RFQ email sent successfully!');
            
            // Trigger tracking RFQ Floated status update
            if (onSent) {
                await onSent();
            }
            onClose();
        } catch (err) {
            console.error('[Send RFQ Email Error]:', err);
            toast.error('Failed to send RFQ email: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            animation: 'fadeIn 0.2s ease-out'
        }}>
            <div style={{
                background: '#fff',
                width: '100%',
                maxWidth: '900px',
                borderRadius: '24px',
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                maxHeight: '95vh',
                border: '1px solid #e2e8f0'
            }}>
                {/* Modal Header */}
                <div style={{ padding: '16px 24px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ background: '#eef2ff', padding: '10px', borderRadius: '12px' }}>
                            <Mail size={20} color="#6366f1" />
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#1e293b' }}>Confirm Email Draft</h3>
                            <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>Review the RFQ content and attachments before sending to suppliers</p>
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '8px' }}>
                        <X size={24} />
                    </button>
                </div>

                {/* Modal Body */}
                <div style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    
                    {/* To/Cc/Bcc inputs */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>To (Suppliers)</label>
                            <input
                                type="text"
                                style={{ width: '100%', padding: '10px 14px', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none', fontSize: '14px', boxSizing: 'border-box' }}
                                value={to}
                                onChange={(e) => setTo(e.target.value)}
                                placeholder="supplier1@example.com; supplier2@example.com"
                            />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cc</label>
                                <input
                                    type="text"
                                    style={{ width: '100%', padding: '10px 14px', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none', fontSize: '14px', boxSizing: 'border-box' }}
                                    value={cc}
                                    onChange={(e) => setCc(e.target.value)}
                                    placeholder="accounts@celron.net; office@celron.net"
                                />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Bcc</label>
                                <input
                                    type="text"
                                    style={{ width: '100%', padding: '10px 14px', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none', fontSize: '14px', boxSizing: 'border-box' }}
                                    value={bcc}
                                    onChange={(e) => setBcc(e.target.value)}
                                    placeholder="manager@celron.net"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Dual column contact picker */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                        
                        {/* Company Contacts */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <label style={{ fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Company Contacts</label>
                                <span style={{ fontSize: '10px', color: '#94a3b8' }}>{filteredCompanyContacts.length} available</span>
                            </div>
                            <div style={{ position: 'relative' }}>
                                <input 
                                    type="text"
                                    placeholder="Search company contacts..."
                                    value={companySearch}
                                    onChange={(e) => setCompanySearch(e.target.value)}
                                    style={{ width: '100%', padding: '8px 12px 8px 30px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }}
                                />
                                <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '11px' }} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '140px', overflowY: 'auto', paddingRight: '4px' }}>
                                {filteredCompanyContacts.length === 0 ? (
                                    <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '11px', border: '1px dashed #cbd5e1', borderRadius: '8px', background: '#fff' }}>
                                        No contacts found
                                    </div>
                                ) : (
                                    filteredCompanyContacts.map((contact, idx) => (
                                        <ContactCard 
                                            key={idx}
                                            contact={contact}
                                            to={to}
                                            cc={cc}
                                            toggleEmailInField={toggleEmailInField}
                                        />
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Our Office Contacts */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderLeft: '1px solid #e2e8f0', paddingLeft: '20px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <label style={{ fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Our Office Contacts</label>
                            </div>
                            <div style={{ position: 'relative' }}>
                                <input 
                                    type="text"
                                    placeholder="Search office contacts..."
                                    value={officeSearch}
                                    onChange={(e) => setOfficeSearch(e.target.value)}
                                    style={{ width: '100%', padding: '8px 12px 8px 30px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }}
                                />
                                <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '11px' }} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '140px', overflowY: 'auto', paddingRight: '4px' }}>
                                {filteredOfficeContacts.map((contact, idx) => (
                                    <ContactCard 
                                        key={idx}
                                        contact={contact}
                                        to={to}
                                        cc={cc}
                                        toggleEmailInField={toggleEmailInField}
                                    />
                                ))}
                            </div>
                        </div>

                    </div>

                    {/* Subject field */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Subject</label>
                        <input
                            type="text"
                            style={{ width: '100%', padding: '10px 14px', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none', fontSize: '14px', boxSizing: 'border-box' }}
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                        />
                    </div>

                    {/* Message Body */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Message Body</label>
                        <textarea
                            style={{ width: '100%', minHeight: '160px', padding: '14px', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none', resize: 'vertical', fontFamily: 'monospace', fontSize: '13px', lineHeight: '1.5', boxSizing: 'border-box' }}
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                        />
                    </div>

                    {/* Google Drive Attachments Section */}
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', background: '#fff', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        
                        {/* Header area */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Paperclip size={18} color="#6366f1" />
                                <span style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>Attach Files</span>
                                {loadingDriveFiles && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#64748b' }}>
                                        <Loader2 size={12} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} />
                                        <span>Syncing with GDrive...</span>
                                    </div>
                                )}
                            </div>
                            <div style={{ display: 'flex', gap: '6px' }}>
                                <button
                                    type="button"
                                    onClick={() => window.open(data.gdriveLink || 'https://drive.google.com/drive/folders/1Bui_mkB4d3Ae9Ll-3UHlWXYAauJz-d3w?usp=drive_link', '_blank')}
                                    style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '6px 12px', fontSize: '11px', fontWeight: 600, color: '#475569', cursor: 'pointer' }}
                                >
                                    <FolderOpen size={12} />
                                    Open Enquiry Drive
                                </button>
                                {driveConnected && (
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            let targetId = photosFolderId;
                                            if (!targetId) {
                                                const token = getStoredToken();
                                                targetId = await getOrCreateFolder(token, 'Photos & Media', data.enquiryFolderId);
                                                setPhotosFolderId(targetId);
                                            }
                                            setQrModal({ isOpen: true, folderId: targetId, folderName: 'Photos & Media' });
                                        }}
                                        style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '6px 12px', fontSize: '11px', fontWeight: 600, color: '#166534', cursor: 'pointer' }}
                                    >
                                        <Smartphone size={12} />
                                        Mobile Upload (QR)
                                    </button>
                                )}
                                {driveConnected && (
                                    <button
                                        type="button"
                                        onClick={handleSaveToDrive}
                                        disabled={savingToDrive || loadingDriveFiles}
                                        style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)', border: '1px solid #93c5fd', borderRadius: '6px', padding: '6px 12px', fontSize: '11px', fontWeight: 700, color: '#1d4ed8', cursor: 'pointer' }}
                                        title="Save a copy of documents into Google Drive & refresh list"
                                    >
                                        <UploadCloud size={13} className={savingToDrive ? 'animate-spin' : ''} />
                                        {savingToDrive ? 'Saving Copy...' : '☁️ Save Copy to Drive'}
                                    </button>
                                )}
                                {driveConnected && (
                                    <button
                                        type="button"
                                        onClick={fetchDriveFiles}
                                        disabled={loadingDriveFiles}
                                        style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '6px 12px', fontSize: '11px', fontWeight: 600, color: '#475569', cursor: 'pointer' }}
                                    >
                                        <RefreshCw size={12} className={loadingDriveFiles ? 'animate-spin' : ''} style={{ animation: loadingDriveFiles ? 'spin 1s linear infinite' : 'none' }} />
                                        Refresh Drive
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Google Drive Subfolder Tabs */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', borderBottom: '1px solid #cbd5e1', paddingBottom: '1px' }}>
                                {[
                                    { id: 'supplierEnquiry', name: 'Supplier Enquiry uploads', count: supplierEnquiryFiles.length },
                                    { id: 'photosMedia', name: 'Photos & Media', count: photosMediaFiles.length },
                                    { id: 'quotationsReceived', name: 'Quotations received', count: quotationsReceivedFiles.length }
                                ].map(tab => {
                                    const isActive = activeAttachmentTab === tab.id;
                                    return (
                                        <button
                                            key={tab.id}
                                            type="button"
                                            onClick={() => setActiveAttachmentTab(tab.id)}
                                            style={{
                                                padding: '8px 12px',
                                                fontSize: '12px',
                                                fontWeight: 600,
                                                border: 'none',
                                                background: isActive ? '#f1f5f9' : 'transparent',
                                                color: isActive ? '#6366f1' : '#64748b',
                                                borderBottom: isActive ? '2px solid #6366f1' : '2px solid transparent',
                                                borderRadius: '6px 6px 0 0',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                whiteSpace: 'nowrap'
                                            }}
                                        >
                                            {tab.name}
                                            <span style={{ fontSize: '10px', background: isActive ? '#eef2ff' : '#f1f5f9', color: isActive ? '#6366f1' : '#64748b', padding: '1px 6px', borderRadius: '10px' }}>
                                                {tab.count}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Files in selected tab */}
                            <div style={{ minHeight: '100px', maxHeight: '160px', overflowY: 'auto', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px' }}>
                                {!driveConnected ? (
                                    <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8', fontSize: '11px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                                        <span>Google Drive is not connected.</span>
                                        <button 
                                            type="button"
                                            onClick={async () => {
                                                const { connectGoogleAPI } = await import('../../lib/googleAuthService');
                                                connectGoogleAPI();
                                            }}
                                            style={{ padding: '4px 10px', fontSize: '11px', fontWeight: 600, background: '#6366f1', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                        >
                                            Connect Google Drive
                                        </button>
                                    </div>
                                ) : !data.enquiryFolderId ? (
                                    <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8', fontSize: '11px' }}>
                                        No Google Drive folder linked to this enquiry. Save/provision folder first.
                                    </div>
                                ) : loadingDriveFiles ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '80px', gap: '8px', color: '#64748b' }}>
                                        <Loader2 size={20} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} />
                                        <span style={{ fontSize: '11px' }}>Loading files from Google Drive...</span>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        {/* Get files based on active tab */}
                                        {(() => {
                                            const currentFiles = activeAttachmentTab === 'supplierEnquiry' ? supplierEnquiryFiles 
                                                              : activeAttachmentTab === 'photosMedia' ? photosMediaFiles 
                                                              : quotationsReceivedFiles;

                                            if (currentFiles.length === 0) {
                                                return (
                                                    <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8', fontSize: '11px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                                                        <span>No files found in Google Drive '{activeAttachmentTab === 'supplierEnquiry' ? 'Supplier Enquiry uploads' : activeAttachmentTab === 'photosMedia' ? 'Photos & Media' : 'Quotations received'}' folder.</span>
                                                        {driveConnected && (
                                                            <button
                                                                type="button"
                                                                onClick={handleSaveToDrive}
                                                                disabled={savingToDrive}
                                                                style={{ padding: '6px 14px', fontSize: '11px', fontWeight: 700, background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                                                            >
                                                                <UploadCloud size={14} className={savingToDrive ? 'animate-spin' : ''} />
                                                                {savingToDrive ? 'Saving...' : 'Save Current Documents to Drive & Refresh'}
                                                            </button>
                                                        )}
                                                    </div>
                                                );
                                            }

                                            return currentFiles.map(file => {
                                                const isAttached = attachments.some(a => a.name === file.name);
                                                return (
                                                    <div key={file.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: '#fff', border: '1px solid #f1f5f9', borderRadius: '6px' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', flex: 1 }}>
                                                            {getFileIcon(file.mimeType)}
                                                            <span style={{ fontSize: '12px', fontWeight: 500, color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</span>
                                                            {file.size && <span style={{ fontSize: '10px', color: '#94a3b8' }}>({Math.round(parseInt(file.size) / 1024)} KB)</span>}
                                                        </div>
                                                        {isAttached ? (
                                                            <span style={{ fontSize: '11px', fontWeight: 600, color: '#10b981', display: 'flex', alignItems: 'center', gap: '3px', padding: '2px 8px' }}>
                                                                <FileCheck size={13} /> Attached
                                                            </span>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                onClick={() => attachDriveFile(file)}
                                                                disabled={saving}
                                                                style={{ padding: '3px 8px', fontSize: '11px', fontWeight: 600, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#2563eb', borderRadius: '4px', cursor: 'pointer' }}
                                                            >
                                                                + Attach
                                                            </button>
                                                        )}
                                                    </div>
                                                );
                                            });
                                        })()}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div style={{ marginTop: '12px' }}>
                            <SmartAttachmentDropzone
                                activeFolderId={
                                    activeAttachmentTab === 'supplierEnquiry' ? supplierUploadsFolderId :
                                    activeAttachmentTab === 'photosMedia' ? photosFolderId : quotationsFolderId
                                }
                                activeFolderName={
                                    activeAttachmentTab === 'supplierEnquiry' ? 'Supplier Enquiry uploads' :
                                    activeAttachmentTab === 'photosMedia' ? 'Photos & Media' : 'Quotations received'
                                }
                                onFileAdded={(file) => {
                                    if (file.isGoogleDrive) {
                                        attachDriveFile(file);
                                    } else {
                                        setAttachments(prev => [...prev, file]);
                                    }
                                }}
                                isDriveConnected={driveConnected}
                                onOpenAuth={() => {
                                    toast.error("Please connect Google Drive first in settings.");
                                }}
                            />
                        </div>

                        {/* Attached list */}
                        {attachments.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
                                <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Currently Attached ({attachments.length})
                                </label>
                                {attachments.map((file, idx) => (
                                    <div key={idx} style={{ background: '#f8fafc', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                            <Paperclip size={15} color="#64748b" />
                                            <span style={{ fontSize: '12px', color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</span>
                                            <span style={{ fontSize: '11px', color: '#94a3b8' }}>({Math.round((file.size || 0) / 1024)} KB)</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (file instanceof File || file instanceof Blob) {
                                                        const url = URL.createObjectURL(file);
                                                        window.open(url, '_blank');
                                                    } else if (file.url || file.preview || file.webContentLink || file.webViewLink) {
                                                        window.open(file.url || file.preview || file.webContentLink || file.webViewLink, '_blank');
                                                    } else {
                                                        toast.error('Unable to open file preview.');
                                                    }
                                                }}
                                                style={{ background: '#eff6ff', border: '1px solid #bfdbfe', color: '#2563eb', cursor: 'pointer', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}
                                                title="Open / Verify Document PDF"
                                            >
                                                <Eye size={13} /> Open / Verify PDF
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => removeAttachment(idx)}
                                                style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
                                                title="Remove attachment"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                </div>

                {/* Modal Footer */}
                <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '12px', background: '#f8fafc' }}>
                    <button
                        onClick={onClose}
                        disabled={saving}
                        style={{ padding: '10px 20px', fontSize: '14px', fontWeight: 600, color: '#475569', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', opacity: saving ? 0.7 : 1 }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSendEmail}
                        disabled={saving}
                        style={{ padding: '10px 20px', fontSize: '14px', fontWeight: 600, color: '#fff', background: '#6366f1', border: 'none', borderRadius: '8px', cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px', opacity: saving ? 0.7 : 1 }}
                    >
                        <Send size={16} /> {saving ? 'Sending...' : 'Send Email Now'}
                    </button>
                </div>
            </div>

            <style dangerouslySetInnerHTML={{ __html: `
                @keyframes fadeIn { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }
            `}} />

            {qrModal.isOpen && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 11000, padding: '20px' }}>
                    <div style={{ background: '#fff', color: '#1e293b', maxWidth: '400px', width: '100%', padding: '32px', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.15)', textAlign: 'center', position: 'relative' }}>
                        <button 
                            type="button"
                            onClick={() => setQrModal({ isOpen: false, folderId: null, folderName: '' })}
                            style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
                            onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                            onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
                        >
                            <X size={24} />
                        </button>

                        <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#ecfdf5', color: '#10b981', display: 'flex', alignItems: 'center', justify: 'center', margin: '0 auto 16px' }}>
                            <Smartphone size={24} />
                        </div>

                        <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', marginBottom: '8px' }}>Mobile Upload Gateway</h3>
                        <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '24px', lineHeight: '1.4' }}>
                            Scan this QR code with your smartphone camera to upload files directly to your <strong>{qrModal.folderName}</strong> folder.
                        </p>

                        {!qrModal.folderId ? (
                            <div style={{ padding: '40px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                                <Loader2 size={36} className="animate-spin text-primary" style={{ animation: 'spin 1s linear infinite' }} />
                                <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 500 }}>Connecting Google Drive...</span>
                            </div>
                        ) : (
                            <div>
                                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '16px', border: '1px dashed #cbd5e1', display: 'inline-block', marginBottom: '24px' }}>
                                    <img 
                                        src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
                                            `${window.location.origin}/upload-media?folderId=${qrModal.folderId}&token=${getStoredToken() || localStorage.getItem('google_access_token')}&jobName=${encodeURIComponent(qrModal.folderName)}`
                                        )}`}
                                        alt="Upload QR Code"
                                        style={{ width: '200px', height: '200px', display: 'block' }}
                                    />
                                </div>

                                <div style={{ fontSize: '0.8rem', color: '#94a3b8', background: '#f8fafc', padding: '10px 14px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                                    <Info size={14} style={{ flexShrink: 0 }} />
                                    <span>Session active. QR code is valid for temporary uploading.</span>
                                </div>
                            </div>
                        )}

                        <button 
                            type="button"
                            className="btn btn-primary" 
                            style={{ width: '100%', marginTop: '24px', padding: '12px', borderRadius: '12px', fontWeight: 700, background: '#6366f1', border: 'none', color: '#fff', cursor: 'pointer' }}
                            onClick={() => setQrModal({ isOpen: false, folderId: null, folderName: '' })}
                        >
                            Done
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// Inner helper component for Contact Card
function ContactCard({ contact, to, cc, toggleEmailInField }) {
    const contactEmail = (contact.email || '').trim().toLowerCase();
    const isToActive = contactEmail ? to.split(';').map(e => e.trim().toLowerCase()).includes(contactEmail) : false;
    const isCcActive = contactEmail ? cc.split(';').map(e => e.trim().toLowerCase()).includes(contactEmail) : false;

    return (
        <div style={{
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '6px 10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
            minWidth: '220px'
        }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={contact.name}>
                    {contact.name}
                </span>
                <span style={{ fontSize: '10px', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={contact.email || 'No email registered'}>
                    {contact.email || 'No email registered'}
                </span>
                {contact.supplierName && (
                    <span style={{ fontSize: '9px', fontWeight: 600, color: '#6366f1', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {contact.supplierName}
                    </span>
                )}
            </div>
            
            <div style={{ display: 'flex', gap: '5px', borderLeft: '1px solid #f1f5f9', paddingLeft: '8px', alignItems: 'center' }}>
                {contact.email && (
                    <>
                        <button 
                            type="button"
                            onClick={() => toggleEmailInField('to', contact.email)}
                            style={{ 
                                background: isToActive ? '#eef2ff' : '#f8fafc', 
                                color: isToActive ? '#4f46e5' : '#64748b', 
                                border: `1px solid ${isToActive ? '#c7d2fe' : '#e2e8f0'}`, 
                                borderRadius: '4px', 
                                padding: '2px 8px', 
                                fontSize: '10px', 
                                fontWeight: 800, 
                                cursor: 'pointer',
                                transition: 'all 0.15s ease-in-out'
                            }}
                        >
                            To
                        </button>
                        
                        <button 
                            type="button"
                            onClick={() => toggleEmailInField('cc', contact.email)}
                            style={{ 
                                background: isCcActive ? '#f0fdf4' : '#f8fafc', 
                                color: isCcActive ? '#16a34a' : '#64748b', 
                                border: `1px solid ${isCcActive ? '#bbf7d0' : '#e2e8f0'}`, 
                                borderRadius: '4px', 
                                padding: '2px 8px', 
                                fontSize: '10px', 
                                fontWeight: 800, 
                                cursor: 'pointer',
                                transition: 'all 0.15s ease-in-out'
                            }}
                        >
                            Cc
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
