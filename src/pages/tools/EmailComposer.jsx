import React, { useState, useEffect } from 'react';
import { Mail, Send, X, Plus, Search, Paperclip, Trash2, FolderPlus, Link2, RefreshCw, FileText, ImageIcon, Loader2, Smartphone, Info } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { getStoredToken } from '../../lib/googleAuthService';
import { listFolderContent, getOrCreateFolder } from '../../lib/driveService';
import { getPartners, getContacts, getDocumentSettings } from '../../lib/store';
import toast from 'react-hot-toast';
import SmartAttachmentDropzone from '../../components/common/SmartAttachmentDropzone';

export default function EmailComposer() {
    const { profile } = useAuth();
    
    // Email states
    const [to, setTo] = useState('');
    const [cc, setCc] = useState('accounts@celron.net; acct.celron.sg@gmail.com');
    const [bcc, setBcc] = useState('celron.simlim0305@gmail.com');
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [attachments, setAttachments] = useState([]);
    
    // Master data lists
    const [contacts, setContacts] = useState([]);
    const [partners, setPartners] = useState([]);
    const [staff, setStaff] = useState([]);
    const [settings, setSettings] = useState(null);
    const [loadingData, setLoadingData] = useState(true);

    // Contact search states
    const [companySearch, setCompanySearch] = useState('');
    const [officeSearch, setOfficeSearch] = useState('');
    const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);
    const [showOfficeDropdown, setShowOfficeDropdown] = useState(false);
    const [customVisibleContacts, setCustomVisibleContacts] = useState([]);
    const [customOfficeContacts, setCustomOfficeContacts] = useState([]);

    // Contact creation modal states
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [modalContactType, setModalContactType] = useState('customer'); // 'customer' or 'office'
    const [modalEditingContact, setModalEditingContact] = useState(null);
    const [modalName, setModalName] = useState('');
    const [modalEmail, setModalEmail] = useState('');
    const [modalPost, setModalPost] = useState('');
    const [modalHandphone, setModalHandphone] = useState('');
    const [modalDepartment, setModalDepartment] = useState('');
    const [isSavingContactModal, setIsSavingContactModal] = useState(false);

    // GDrive integration states
    const [isDriveConnected, setIsDriveConnected] = useState(false);
    const [loadingDrive, setLoadingDrive] = useState(false);
    const [masterComposerFolderId, setMasterComposerFolderId] = useState(null);
    const [activeFolderId, setActiveFolderId] = useState(null);
    const [activeFolderName, setActiveFolderName] = useState('');
    const [activeAttachmentTab, setActiveAttachmentTab] = useState('worksuite'); // 'worksuite', 'support', 'photos', 'bills'
    
    // Files inside the active subfolders
    const [worksuiteFiles, setWorksuiteFiles] = useState([]);
    const [supportFiles, setSupportFiles] = useState([]);
    const [photosFiles, setPhotosFiles] = useState([]);
    const [billsFiles, setBillsFiles] = useState([]);

    // Subfolder IDs of the active folder
    const [subfolderIds, setSubfolderIds] = useState({
        worksuite: null,
        support: null,
        photos: null,
        bills: null
    });

    // Link Folder modal state
    const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
    const [composerSubfolders, setComposerSubfolders] = useState([]);
    const [loadingSubfolders, setLoadingSubfolders] = useState(false);

    // General states
    const [sending, setSending] = useState(false);

    const defaultOfficeContacts = [
        { name: 'Our Office', email: 'accounts@celron.net', post: 'Billing / Finance' },
        { name: 'N.R.KUMAR', email: 'kumar@celron.net', post: 'Director', handphone: '+65 97685891' },
        { name: 'Sales Office', email: 'sales@celron.net', post: 'General Sales' }
    ];

    // Load master data
    useEffect(() => {
        const loadInitialData = async () => {
            if (!profile?.company_id) return;
            setLoadingData(true);
            try {
                const [pRes, cRes, sRes] = await Promise.all([
                    getPartners(profile),
                    getContacts(profile),
                    getDocumentSettings(profile?.company_id)
                ]);

                if (pRes) setPartners(pRes);
                if (cRes) setContacts(cRes);
                if (sRes) setSettings(sRes);

                const { data: staffData } = await supabase.from('staff').select('*').order('full_name');
                if (staffData) setStaff(staffData);

            } catch (err) {
                console.error('[EmailComposer] Failed to load initial data:', err);
                toast.error('Failed to load contacts and settings.');
            } finally {
                setLoadingData(false);
            }
        };

        loadInitialData();
    }, [profile]);

    // Google Drive check and provisioning
    useEffect(() => {
        const token = getStoredToken() || localStorage.getItem('google_access_token');
        if (token && settings) {
            setIsDriveConnected(true);
            provisionComposerWorkspace(token);
        } else {
            setIsDriveConnected(false);
        }
    }, [settings]);

    const provisionComposerWorkspace = async (token) => {
        setLoadingDrive(true);
        try {
            const rootId = settings?.gdrive_celron_root_id || settings?.google_drive_folder_id;
            if (!rootId) {
                console.warn("[EmailComposer] GDrive root folder ID is missing in settings.");
                setLoadingDrive(false);
                return;
            }

            // 1. Ensure master folder "Email Composer" exists in CelronHub Root
            console.log("[EmailComposer] Provisioning master Email Composer folder...");
            const masterId = await getOrCreateFolder(token, 'Email Composer', rootId);
            setMasterComposerFolderId(masterId);

            // 2. Default workspace subfolder "General_Mail" inside Email Composer
            console.log("[EmailComposer] Provisioning default General_Mail folder...");
            const defaultMailFolderId = await getOrCreateFolder(token, 'General_Mail', masterId);
            
            // Provision its structures and make active
            await selectActiveFolder(token, defaultMailFolderId, 'General_Mail');

        } catch (err) {
            console.error("[EmailComposer] Failed to provision folder workspace:", err);
            toast.error("Failed to connect or create Google Drive folders.");
        } finally {
            setLoadingDrive(false);
        }
    };

    // Sets active folder, creates subfolders, and loads their files
    const selectActiveFolder = async (token, folderId, folderName) => {
        setLoadingDrive(true);
        setActiveFolderId(folderId);
        setActiveFolderName(folderName);
        try {
            // Provision the 4 subfolders inside active folder
            const worksuiteId = await getOrCreateFolder(token, 'Worksuite', folderId);
            const supportId = await getOrCreateFolder(token, 'SupportDocs', folderId);
            const photosId = await getOrCreateFolder(token, 'Photos & Gallery', folderId);
            const billsId = await getOrCreateFolder(token, 'SupplierBills&Expenses', folderId);

            setSubfolderIds({
                worksuite: worksuiteId,
                support: supportId,
                photos: photosId,
                bills: billsId
            });

            // Fetch contents of each folder
            const [wFiles, sFiles, pFiles, bFiles] = await Promise.all([
                listFolderContent(token, worksuiteId),
                listFolderContent(token, supportId),
                listFolderContent(token, photosId),
                listFolderContent(token, billsId)
            ]);

            setWorksuiteFiles(wFiles || []);
            setSupportFiles(sFiles || []);
            setPhotosFiles(pFiles || []);
            setBillsFiles(bFiles || []);

        } catch (err) {
            console.error("[EmailComposer] Error listing subfolders:", err);
            toast.error("Failed to sync subfolder contents.");
        } finally {
            setLoadingDrive(false);
        }
    };

    const handleRefreshDrive = async () => {
        const token = getStoredToken() || localStorage.getItem('google_access_token');
        if (!token || !activeFolderId) return;
        await selectActiveFolder(token, activeFolderId, activeFolderName);
        toast.success("Google Drive files refreshed!");
    };

    // Create a new folder under master "Email Composer"
    const handleCreateFolder = async () => {
        const token = getStoredToken() || localStorage.getItem('google_access_token');
        if (!token || !masterComposerFolderId) {
            toast.error("Google Drive connection is not active.");
            return;
        }

        const name = prompt("Enter a name for the new Email workspace folder:");
        if (!name || !name.trim()) return;

        setLoadingDrive(true);
        try {
            console.log(`[EmailComposer] Creating folder: ${name.trim()} inside master ${masterComposerFolderId}`);
            const newFolderId = await getOrCreateFolder(token, name.trim(), masterComposerFolderId);
            
            // Select and provision subfolders
            await selectActiveFolder(token, newFolderId, name.trim());
            toast.success(`Active workspace switched to "${name.trim()}"`);
        } catch (err) {
            console.error("[EmailComposer] Failed to create folder:", err);
            toast.error("Failed to create folder: " + err.message);
        } finally {
            setLoadingDrive(false);
        }
    };

    // Open Link Folder modal listing all subfolders
    const handleOpenLinkModal = async () => {
        const token = getStoredToken() || localStorage.getItem('google_access_token');
        if (!token || !masterComposerFolderId) {
            toast.error("Google Drive is not connected.");
            return;
        }

        setIsLinkModalOpen(true);
        setLoadingSubfolders(true);
        try {
            const list = await listFolderContent(token, masterComposerFolderId);
            // Filter only folder types
            const folders = list.filter(item => item.mimeType === 'application/vnd.google-apps.folder');
            setComposerSubfolders(folders);
        } catch (err) {
            console.error("[EmailComposer] Failed to list subfolders:", err);
            toast.error("Failed to load folders.");
        } finally {
            setLoadingSubfolders(false);
        }
    };

    const handleSelectLinkedFolder = async (folder) => {
        const token = getStoredToken() || localStorage.getItem('google_access_token');
        if (!token) return;
        setIsLinkModalOpen(false);
        await selectActiveFolder(token, folder.id, folder.name);
        toast.success(`Switched active workspace folder to "${folder.name}"`);
    };

    // Add a file from Google Drive
    const handleAttachDriveFile = async (fileInfo) => {
        if (sending) return;
        setSending(true);
        try {
            const token = getStoredToken() || localStorage.getItem('google_access_token');
            if (!token) throw new Error('Google Drive account is not connected.');

            console.log('[EmailComposer] Downloading GDrive file:', fileInfo.name);
            const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileInfo.id}?alt=media`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Failed to download content from Google Drive');
            
            const blob = await response.blob();
            const file = new File([blob], fileInfo.name, { type: fileInfo.mimeType || 'application/octet-stream' });
            
            setAttachments(prev => [...prev, file]);
            toast.success(`Attached "${fileInfo.name}"`);
        } catch (err) {
            console.error('[EmailComposer] Attachment download failed:', err);
            toast.error('Failed to attach Google Drive file: ' + err.message);
        } finally {
            setSending(false);
        }
    };

    const handleAddLocalAttachment = (file) => {
        setAttachments(prev => [...prev, file]);
    };

    const handleRemoveAttachment = (idx) => {
        setAttachments(prev => prev.filter((_, i) => i !== idx));
    };

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

    // Filtering dropdown options
    const getCompanyDropdownOptions = () => {
        const query = companySearch.trim().toLowerCase();
        const currentEmails = to.split(';').concat(cc.split(';')).map(c => c.trim().toLowerCase()).filter(Boolean);
        
        const filtered = contacts.filter(c => c.email && !currentEmails.includes(c.email.toLowerCase()));
        if (!query) return filtered.slice(0, 10);
        return filtered.filter(c => 
            (c.name || '').toLowerCase().includes(query) || 
            (c.email || '').toLowerCase().includes(query)
        );
    };

    const getOfficeDropdownOptions = () => {
        const query = officeSearch.trim().toLowerCase();
        const currentEmails = to.split(';').concat(cc.split(';')).map(c => c.trim().toLowerCase()).filter(Boolean);

        const isCelron = (c) => {
            if (!c.email) return false;
            const emailLower = c.email.toLowerCase();
            return emailLower.endsWith('@celron.net') || emailLower.endsWith('@celron.com') || emailLower.includes('celron');
        };

        const staffList = staff.map(s => ({ name: s.full_name, email: s.email, post: 'Staff' }));
        const celronContacts = contacts.filter(c => isCelron(c)).map(c => ({ name: c.name, email: c.email, post: c.post || 'Contact' }));
        const combined = [...defaultOfficeContacts, ...staffList, ...celronContacts, ...customOfficeContacts];

        const unique = [];
        combined.forEach(item => {
            if (item.email && !unique.some(x => x.email.toLowerCase() === item.email.toLowerCase())) {
                unique.push(item);
            }
        });

        const filtered = unique.filter(c => !currentEmails.includes(c.email.toLowerCase()));
        if (!query) return filtered.slice(0, 10);
        return filtered.filter(c => 
            (c.name || '').toLowerCase().includes(query) || 
            (c.email || '').toLowerCase().includes(query)
        );
    };

    // Save added contacts
    const handleSaveModalContact = async (e) => {
        if (e) e.preventDefault();
        if (!modalName.trim() || !modalEmail.trim()) {
            toast.error('Please enter both Name and Email.');
            return;
        }

        setIsSavingContactModal(true);
        try {
            const newContact = {
                name: modalName.trim(),
                email: modalEmail.trim().toLowerCase(),
                post: modalPost.trim() || null,
                handphone: modalHandphone.trim() || null,
                department: modalDepartment.trim() || null
            };

            if (modalContactType === 'customer') {
                setCustomVisibleContacts(prev => [newContact, ...prev]);
            } else {
                setCustomOfficeContacts(prev => [newContact, ...prev]);
            }

            toggleEmailInField('to', newContact.email);
            setIsAddModalOpen(false);
            toast.success("Contact added successfully!");
        } catch (err) {
            console.error(err);
            toast.error("Failed to add contact.");
        } finally {
            setIsSavingContactModal(false);
        }
    };

    // Send Email
    const handleSendEmail = async () => {
        const recipientTo = to.trim();
        if (!recipientTo) {
            toast.error('Please enter a recipient email address in the "To" field before sending.');
            return;
        }

        setSending(true);
        const apiUrl = `${import.meta.env.VITE_API_URL || ''}/api/send-email`;
        console.log('[EmailComposer] Dispatched send API request to:', apiUrl);

        try {
            const fallbackSalesEmail = settings?.sales_email || 'sales@celron.net';
            const fromEmail = fallbackSalesEmail;

            // Convert staged files to base64 attachments payload
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
                    company_id: profile?.company_id,
                    from_email: fromEmail,
                    to: to,
                    cc: cc,
                    bcc: bcc,
                    subject: subject,
                    body: body,
                    attachments: customAttachments
                })
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(text || 'Network error');
            }

            toast.success("Email sent successfully!");
            // Reset fields
            setTo('');
            setSubject('');
            setBody('');
            setAttachments([]);

        } catch (err) {
            console.error('[EmailComposer] Send failed:', err);
            toast.error('Failed to send email: ' + err.message);
        } finally {
            setSending(false);
        }
    };

    const getExplorerFileIcon = (mimeType) => {
        if (mimeType?.startsWith('image/')) return <ImageIcon size={14} color="#3b82f6" />;
        if (mimeType?.includes('pdf')) return <FileText size={14} color="#ef4444" />;
        return <Paperclip size={14} color="#64748b" />;
    };

    return (
        <div style={{ padding: '32px', background: '#f8fafc', minHeight: '100%', borderRadius: '16px', boxSizing: 'border-box' }}>
            <header style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ padding: '10px', background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', borderRadius: '12px', color: '#fff' }}>
                        <Mail size={24} />
                    </div>
                    <div>
                        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>Email Composer</h1>
                        <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}>Compose and send corporate correspondence integrated with Google Drive files and mobile scanning.</p>
                    </div>
                </div>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px' }}>
                <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    
                    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>To</label>
                                <input
                                    type="email"
                                    placeholder="recipient@example.com"
                                    style={{ width: '100%', padding: '10px 14px', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none', fontSize: '14px', boxSizing: 'border-box' }}
                                    value={to}
                                    onChange={(e) => setTo(e.target.value)}
                                />
                            </div>
                            
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cc (Separate with semicolon)</label>
                                    <textarea
                                        rows="2"
                                        style={{ width: '100%', padding: '10px 14px', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none', fontSize: '14px', boxSizing: 'border-box', resize: 'none' }}
                                        value={cc}
                                        onChange={(e) => setCc(e.target.value)}
                                        placeholder="email1@example.com; email2@example.com"
                                    />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Bcc</label>
                                    <textarea
                                        rows="2"
                                        style={{ width: '100%', padding: '10px 14px', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none', fontSize: '14px', boxSizing: 'border-box', resize: 'none' }}
                                        value={bcc}
                                        onChange={(e) => setBcc(e.target.value)}
                                        placeholder="bcc1@example.com; bcc2@example.com"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Searchable Contact Panels */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                            {/* Company Contacts */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <label style={{ fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Company Contacts</label>
                                    <button 
                                        type="button"
                                        onClick={() => {
                                            setModalContactType('customer');
                                            setModalEditingContact(null);
                                            setModalName('');
                                            setModalEmail('');
                                            setModalPost('');
                                            setModalHandphone('');
                                            setIsAddModalOpen(true);
                                        }}
                                        style={{ background: 'transparent', border: 'none', color: '#2563eb', fontSize: '11px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                                    >
                                        <Plus size={12} /> Add Contact
                                    </button>
                                </div>
                                <div style={{ position: 'relative' }}>
                                    <input 
                                        type="text"
                                        placeholder="Search contacts..."
                                        value={companySearch}
                                        onChange={(e) => { setCompanySearch(e.target.value); setShowCompanyDropdown(true); }}
                                        onFocus={() => setShowCompanyDropdown(true)}
                                        style={{ width: '100%', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }}
                                    />
                                    {showCompanyDropdown && (
                                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', zIndex: 100, maxHeight: '200px', overflowY: 'auto', marginTop: '4px' }}>
                                            {getCompanyDropdownOptions().length === 0 ? (
                                                <div style={{ padding: '10px', fontSize: '11px', color: '#64748b', textAlign: 'center' }}>No available contacts</div>
                                            ) : (
                                                getCompanyDropdownOptions().map((opt, i) => (
                                                    <div 
                                                        key={i} 
                                                        onClick={() => { toggleEmailInField('to', opt.email); setShowCompanyDropdown(false); }}
                                                        style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '12px', borderBottom: '1px solid #f1f5f9' }}
                                                        onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                                                        onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                                                    >
                                                        <div style={{ fontWeight: 600 }}>{opt.name}</div>
                                                        <div style={{ fontSize: '10px', color: '#64748b' }}>{opt.email}</div>
                                                    </div>
                                                ))
                                            )}
                                            <div 
                                                onClick={() => setShowCompanyDropdown(false)}
                                                style={{ padding: '6px 12px', cursor: 'pointer', fontSize: '11px', color: '#ef4444', textAlign: 'center', background: '#f8fafc', fontWeight: 600 }}
                                            >
                                                Close List
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '140px', overflowY: 'auto' }}>
                                    {customVisibleContacts.map((c, i) => (
                                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                                            <div style={{ overflow: 'hidden' }}>
                                                <div style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>{c.name}</div>
                                                <div style={{ fontSize: '10px', color: '#64748b' }}>{c.email}</div>
                                            </div>
                                            <button 
                                                onClick={() => toggleEmailInField('to', c.email)}
                                                style={{ background: to.split(';').map(x => x.trim().toLowerCase()).includes(c.email.toLowerCase()) ? '#22c55e' : '#cbd5e1', border: 'none', color: '#fff', fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: '4px', cursor: 'pointer' }}
                                            >
                                                {to.split(';').map(x => x.trim().toLowerCase()).includes(c.email.toLowerCase()) ? 'Active' : '+ To'}
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Office Contacts */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderLeft: '1px solid #e2e8f0', paddingLeft: '20px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <label style={{ fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Our Office Contacts</label>
                                    <button 
                                        type="button"
                                        onClick={() => {
                                            setModalContactType('office');
                                            setModalEditingContact(null);
                                            setModalName('');
                                            setModalEmail('');
                                            setModalPost('');
                                            setModalHandphone('');
                                            setIsAddModalOpen(true);
                                        }}
                                        style={{ background: 'transparent', border: 'none', color: '#2563eb', fontSize: '11px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                                    >
                                        <Plus size={12} /> Add Contact
                                    </button>
                                </div>
                                <div style={{ position: 'relative' }}>
                                    <input 
                                        type="text"
                                        placeholder="Search office contacts..."
                                        value={officeSearch}
                                        onChange={(e) => { setOfficeSearch(e.target.value); setShowOfficeDropdown(true); }}
                                        onFocus={() => setShowOfficeDropdown(true)}
                                        style={{ width: '100%', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }}
                                    />
                                    {showOfficeDropdown && (
                                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', zIndex: 100, maxHeight: '200px', overflowY: 'auto', marginTop: '4px' }}>
                                            {getOfficeDropdownOptions().length === 0 ? (
                                                <div style={{ padding: '10px', fontSize: '11px', color: '#64748b', textAlign: 'center' }}>No office contacts</div>
                                            ) : (
                                                getOfficeDropdownOptions().map((opt, i) => (
                                                    <div 
                                                        key={i} 
                                                        onClick={() => { toggleEmailInField('cc', opt.email); setShowOfficeDropdown(false); }}
                                                        style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '12px', borderBottom: '1px solid #f1f5f9' }}
                                                        onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                                                        onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                                                    >
                                                        <div style={{ fontWeight: 600 }}>{opt.name}</div>
                                                        <div style={{ fontSize: '10px', color: '#64748b' }}>{opt.email}</div>
                                                    </div>
                                                ))
                                            )}
                                            <div 
                                                onClick={() => setShowOfficeDropdown(false)}
                                                style={{ padding: '6px 12px', cursor: 'pointer', fontSize: '11px', color: '#ef4444', textAlign: 'center', background: '#f8fafc', fontWeight: 600 }}
                                            >
                                                Close List
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '140px', overflowY: 'auto' }}>
                                    {defaultOfficeContacts.map((c, i) => (
                                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                                            <div style={{ overflow: 'hidden' }}>
                                                <div style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>{c.name}</div>
                                                <div style={{ fontSize: '10px', color: '#64748b' }}>{c.email}</div>
                                            </div>
                                            <button 
                                                onClick={() => toggleEmailInField('cc', c.email)}
                                                style={{ background: cc.split(';').map(x => x.trim().toLowerCase()).includes(c.email.toLowerCase()) ? '#10b981' : '#cbd5e1', border: 'none', color: '#fff', fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: '4px', cursor: 'pointer' }}
                                            >
                                                {cc.split(';').map(x => x.trim().toLowerCase()).includes(c.email.toLowerCase()) ? 'Active' : '+ Cc'}
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Subject</label>
                            <input
                                type="text"
                                placeholder="Enter email subject"
                                style={{ width: '100%', padding: '10px 14px', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none', fontSize: '14px', boxSizing: 'border-box' }}
                                value={subject}
                                onChange={(e) => setSubject(e.target.value)}
                            />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Message Body</label>
                            <textarea
                                rows="10"
                                style={{ width: '100%', padding: '12px 14px', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none', fontSize: '14px', boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical' }}
                                value={body}
                                onChange={(e) => setBody(e.target.value)}
                                placeholder="Type your email body here..."
                            />
                        </div>

                        {/* Attach Files Section */}
                        <div style={{ border: '1px solid #cbd5e1', borderRadius: '12px', overflow: 'hidden' }}>
                            <div style={{ padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontWeight: 800, fontSize: '13px', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Paperclip size={16} color="#3b82f6" /> Attach Files
                                </span>
                                
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    {isDriveConnected && (
                                        <>
                                            <button 
                                                type="button" 
                                                onClick={handleCreateFolder}
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#047857', padding: '5px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                                                title="Create a new folder in Google Drive Email Composer"
                                            >
                                                <FolderPlus size={12} /> Create Folder
                                            </button>
                                            <button 
                                                type="button" 
                                                onClick={handleOpenLinkModal}
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#fffbeb', border: '1px solid #fde68a', color: '#b45309', padding: '5px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                                                title="Link to an existing Email Composer folder"
                                            >
                                                <Link2 size={12} /> Link Folder
                                            </button>
                                        </>
                                    )}
                                    <button 
                                        type="button" 
                                        onClick={handleRefreshDrive}
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#fff', border: '1px solid #e2e8f0', color: '#64748b', padding: '5px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                                    >
                                        <RefreshCw size={12} /> Refresh Drive
                                    </button>
                                </div>
                            </div>

                            <div style={{ padding: '16px' }}>
                                {isDriveConnected && activeFolderId && (
                                    <div style={{ marginBottom: '12px', fontSize: '11px', color: '#2563eb', fontWeight: 700, background: '#eff6ff', padding: '6px 12px', borderRadius: '6px', display: 'inline-block' }}>
                                        Active Workspace: {activeFolderName}
                                    </div>
                                )}

                                {/* Tabs */}
                                <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid #cbd5e1', marginBottom: '16px' }}>
                                    <button 
                                        type="button" 
                                        onClick={() => setActiveAttachmentTab('worksuite')}
                                        style={{ padding: '8px 16px', background: 'none', border: 'none', borderBottom: activeAttachmentTab === 'worksuite' ? '2px solid #3b82f6' : 'none', color: activeAttachmentTab === 'worksuite' ? '#3b82f6' : '#64748b', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}
                                    >
                                        Worksuite Docs <span style={{ background: '#f1f5f9', padding: '1px 6px', borderRadius: '10px', fontSize: '10px', marginLeft: '4px' }}>{worksuiteFiles.length}</span>
                                    </button>
                                    <button 
                                        type="button" 
                                        onClick={() => setActiveAttachmentTab('support')}
                                        style={{ padding: '8px 16px', background: 'none', border: 'none', borderBottom: activeAttachmentTab === 'support' ? '2px solid #3b82f6' : 'none', color: activeAttachmentTab === 'support' ? '#3b82f6' : '#64748b', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}
                                    >
                                        Support Docs <span style={{ background: '#f1f5f9', padding: '1px 6px', borderRadius: '10px', fontSize: '10px', marginLeft: '4px' }}>{supportFiles.length}</span>
                                    </button>
                                    <button 
                                        type="button" 
                                        onClick={() => setActiveAttachmentTab('photos')}
                                        style={{ padding: '8px 16px', background: 'none', border: 'none', borderBottom: activeAttachmentTab === 'photos' ? '2px solid #3b82f6' : 'none', color: activeAttachmentTab === 'photos' ? '#3b82f6' : '#64748b', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}
                                    >
                                        Photos <span style={{ background: '#f1f5f9', padding: '1px 6px', borderRadius: '10px', fontSize: '10px', marginLeft: '4px' }}>{photosFiles.length}</span>
                                    </button>
                                    <button 
                                        type="button" 
                                        onClick={() => setActiveAttachmentTab('bills')}
                                        style={{ padding: '8px 16px', background: 'none', border: 'none', borderBottom: activeAttachmentTab === 'bills' ? '2px solid #3b82f6' : 'none', color: activeAttachmentTab === 'bills' ? '#3b82f6' : '#64748b', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}
                                    >
                                        Supplier Bills <span style={{ background: '#f1f5f9', padding: '1px 6px', borderRadius: '10px', fontSize: '10px', marginLeft: '4px' }}>{billsFiles.length}</span>
                                    </button>
                                </div>

                                {/* Tab contents listing files in subfolders */}
                                <div style={{ maxHeight: '180px', overflowY: 'auto', marginBottom: '16px', border: '1px solid #f1f5f9', borderRadius: '8px', padding: '8px' }}>
                                    {loadingDrive ? (
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '20px' }}>
                                            <Loader2 size={16} className="animate-spin" />
                                            <span style={{ fontSize: '11px', color: '#64748b' }}>Syncing Drive documents...</span>
                                        </div>
                                    ) : (
                                        <>
                                            {activeAttachmentTab === 'worksuite' && (
                                                worksuiteFiles.length === 0 ? <div style={{ textAlign: 'center', padding: '12px', color: '#94a3b8', fontSize: '11px' }}>No documents found in "Worksuite"</div> : (
                                                    worksuiteFiles.map(file => (
                                                        <div key={file.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: '#fff', border: '1px solid #f1f5f9', borderRadius: '6px', marginBottom: '4px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                                                {getExplorerFileIcon(file.mimeType)}
                                                                <span style={{ fontSize: '11px', color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</span>
                                                            </div>
                                                            <button 
                                                                type="button" 
                                                                onClick={() => handleAttachDriveFile(file)}
                                                                style={{ padding: '3px 8px', fontSize: '10px', fontWeight: 700, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#2563eb', borderRadius: '4px', cursor: 'pointer' }}
                                                            >
                                                                + Attach
                                                            </button>
                                                        </div>
                                                    ))
                                                )
                                            )}

                                            {activeAttachmentTab === 'support' && (
                                                supportFiles.length === 0 ? <div style={{ textAlign: 'center', padding: '12px', color: '#94a3b8', fontSize: '11px' }}>No documents found in "SupportDocs"</div> : (
                                                    supportFiles.map(file => (
                                                        <div key={file.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: '#fff', border: '1px solid #f1f5f9', borderRadius: '6px', marginBottom: '4px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                                                {getExplorerFileIcon(file.mimeType)}
                                                                <span style={{ fontSize: '11px', color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</span>
                                                            </div>
                                                            <button 
                                                                type="button" 
                                                                onClick={() => handleAttachDriveFile(file)}
                                                                style={{ padding: '3px 8px', fontSize: '10px', fontWeight: 700, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#2563eb', borderRadius: '4px', cursor: 'pointer' }}
                                                            >
                                                                + Attach
                                                            </button>
                                                        </div>
                                                    ))
                                                )
                                            )}

                                            {activeAttachmentTab === 'photos' && (
                                                photosFiles.length === 0 ? <div style={{ textAlign: 'center', padding: '12px', color: '#94a3b8', fontSize: '11px' }}>No media found in "Photos & Gallery"</div> : (
                                                    photosFiles.map(file => (
                                                        <div key={file.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: '#fff', border: '1px solid #f1f5f9', borderRadius: '6px', marginBottom: '4px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                                                {getExplorerFileIcon(file.mimeType)}
                                                                <span style={{ fontSize: '11px', color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</span>
                                                            </div>
                                                            <button 
                                                                type="button" 
                                                                onClick={() => handleAttachDriveFile(file)}
                                                                style={{ padding: '3px 8px', fontSize: '10px', fontWeight: 700, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#2563eb', borderRadius: '4px', cursor: 'pointer' }}
                                                            >
                                                                + Attach
                                                            </button>
                                                        </div>
                                                    ))
                                                )
                                            )}

                                            {activeAttachmentTab === 'bills' && (
                                                billsFiles.length === 0 ? <div style={{ textAlign: 'center', padding: '12px', color: '#94a3b8', fontSize: '11px' }}>No documents found in "SupplierBills&Expenses"</div> : (
                                                    billsFiles.map(file => (
                                                        <div key={file.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: '#fff', border: '1px solid #f1f5f9', borderRadius: '6px', marginBottom: '4px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                                                {getExplorerFileIcon(file.mimeType)}
                                                                <span style={{ fontSize: '11px', color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</span>
                                                            </div>
                                                            <button 
                                                                type="button" 
                                                                onClick={() => handleAttachDriveFile(file)}
                                                                style={{ padding: '3px 8px', fontSize: '10px', fontWeight: 700, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#2563eb', borderRadius: '4px', cursor: 'pointer' }}
                                                            >
                                                                + Attach
                                                            </button>
                                                        </div>
                                                    ))
                                                )
                                            )}
                                        </>
                                    )}
                                </div>

                                {/* Reusable Smart Attachment Dropzone Component */}
                                <SmartAttachmentDropzone 
                                    activeFolderId={
                                        activeAttachmentTab === 'worksuite' ? subfolderIds.worksuite :
                                        activeAttachmentTab === 'support' ? subfolderIds.support :
                                        activeAttachmentTab === 'photos' ? subfolderIds.photos : subfolderIds.bills
                                    }
                                    activeFolderName={
                                        activeAttachmentTab === 'worksuite' ? 'Worksuite' :
                                        activeAttachmentTab === 'support' ? 'SupportDocs' :
                                        activeAttachmentTab === 'photos' ? 'Photos & Gallery' : 'SupplierBills&Expenses'
                                    }
                                    onFileAdded={handleAddLocalAttachment}
                                    isDriveConnected={isDriveConnected}
                                />

                                {/* Currently Attached Files List */}
                                {attachments.length > 0 && (
                                    <div style={{ marginTop: '16px', borderTop: '1px solid #f1f5f9', paddingTop: '16px' }}>
                                        <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '8px' }}>
                                            Currently Attached ({attachments.length})
                                        </label>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            {attachments.map((file, idx) => (
                                                <div key={idx} style={{ background: '#f8fafc', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                                        <Paperclip size={14} color="#64748b" />
                                                        <span style={{ fontSize: '12px', color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</span>
                                                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>({Math.round(file.size / 1024)} KB)</span>
                                                    </div>
                                                    <button 
                                                        onClick={() => handleRemoveAttachment(idx)}
                                                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Send controls */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px' }}>
                            <button 
                                type="button" 
                                onClick={() => { setTo(''); setSubject(''); setBody(''); setAttachments([]); }}
                                className="btn btn-secondary" 
                                style={{ padding: '10px 24px' }}
                            >
                                Reset Form
                            </button>
                            <button 
                                type="button" 
                                onClick={handleSendEmail} 
                                disabled={sending}
                                className="btn btn-primary" 
                                style={{ padding: '10px 32px', background: '#3b82f6', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}
                            >
                                {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                                {sending ? 'Sending...' : 'Send Email Now'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Subfolders Link Modal */}
            {isLinkModalOpen && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '20px' }}>
                    <div style={{ background: '#fff', color: '#1e293b', maxWidth: '450px', width: '100%', padding: '24px', borderRadius: '20px', border: '1px solid #e2e8f0', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
                            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>Link Email Workspace Folder</h3>
                            <button onClick={() => setIsLinkModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                                <X size={20} />
                            </button>
                        </div>

                        {loadingSubfolders ? (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '40px' }}>
                                <Loader2 size={24} className="animate-spin" />
                                <span style={{ fontSize: '13px', color: '#64748b' }}>Scanning Google Drive folders...</span>
                            </div>
                        ) : composerSubfolders.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', fontSize: '13px' }}>
                                No subfolders found inside Google Drive "Email Composer" root.
                            </div>
                        ) : (
                            <div style={{ maxHeight: '250px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {composerSubfolders.map(folder => (
                                    <div 
                                        key={folder.id}
                                        onClick={() => handleSelectLinkedFolder(folder)}
                                        style={{ padding: '10px 14px', background: activeFolderId === folder.id ? '#eff6ff' : '#f8fafc', border: activeFolderId === folder.id ? '1px solid #bfdbfe' : '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                        onMouseEnter={e => { if (activeFolderId !== folder.id) e.currentTarget.style.background = '#f1f5f9'; }}
                                        onMouseLeave={e => { if (activeFolderId !== folder.id) e.currentTarget.style.background = '#f8fafc'; }}
                                    >
                                        <span style={{ fontWeight: 600, color: activeFolderId === folder.id ? '#2563eb' : '#334155' }}>{folder.name}</span>
                                        {activeFolderId === folder.id && <span style={{ fontSize: '10px', background: '#3b82f6', color: '#fff', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>Active</span>}
                                    </div>
                                ))}
                            </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                            <button onClick={() => setIsLinkModalOpen(false)} className="btn btn-secondary" style={{ padding: '8px 16px' }}>Close</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Contact Modal */}
            {isAddModalOpen && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '20px' }}>
                    <form onSubmit={handleSaveModalContact} style={{ background: '#fff', color: '#1e293b', maxWidth: '400px', width: '100%', padding: '24px', borderRadius: '20px', border: '1px solid #e2e8f0', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
                            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>Add New Contact ({modalContactType === 'customer' ? 'Company' : 'Office'})</h3>
                            <button type="button" onClick={() => setIsAddModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                                <X size={20} />
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Full Name *</label>
                                <input type="text" style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }} value={modalName} onChange={e => setModalName(e.target.value)} required />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Email Address *</label>
                                <input type="email" style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }} value={modalEmail} onChange={e => setModalEmail(e.target.value)} required />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Designation / Post</label>
                                <input type="text" style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }} value={modalPost} onChange={e => setModalPost(e.target.value)} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Handphone / Mobile</label>
                                <input type="text" style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }} value={modalHandphone} onChange={e => setModalHandphone(e.target.value)} />
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                            <button type="button" onClick={() => setIsAddModalOpen(false)} className="btn btn-secondary" style={{ padding: '8px 16px' }}>Cancel</button>
                            <button type="submit" disabled={isSavingContactModal} className="btn btn-primary" style={{ padding: '8px 20px', background: '#3b82f6' }}>
                                {isSavingContactModal ? 'Saving...' : 'Add Contact'}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}
