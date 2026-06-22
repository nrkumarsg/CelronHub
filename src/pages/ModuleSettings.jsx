import React, { useState, useEffect, useRef } from 'react';
import { Settings, UploadCloud, ToggleRight, ToggleLeft, Save, Plus, Globe, Trash2, ExternalLink, Shield, User, MessageSquare, Share2, HardDrive, Sparkles, Loader2 } from 'lucide-react';
import { getDocumentSettings, saveDocumentSettings, uploadFile } from '../lib/store';
import { getUserTools, createUserTool, updateUserTool, deleteUserTool } from '../lib/toolService';
import { getCommunicationAccounts, createCommunicationAccount, updateCommunicationAccount, deleteCommunicationAccount } from '../lib/communicationService';
import { initializeVault, migrateMessyFolders } from '../lib/vaultService';
import { updateCompany } from '../lib/companyService';
import { useAuth } from '../contexts/AuthContext';
import { isTokenValid } from '../lib/googleAuthService';

export default function ModuleSettings() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [settings, setSettings] = useState({
        company_name: 'CELRON ENTERPRISES PTE LTD',
        gst_uen: '201436227C',
        address: '10, Jln, Besar, "Sim Lim Tower", #03-05, Singapore 208787',
        phone: '+65 6123 4567',
        email: 'sales@celron.net',
        logo_url: '/logo.png',
        signature_url: '',
        watermark: false,
        allow_signup: true,
        google_drive_folder_id: '',
        google_calendar_id: '',
        paynow_url: '',
        bank_details: ''
    });

    const { profile } = useAuth();
    const [activeTab, setActiveTab] = useState('personal'); // 'personal' or 'company'
    const isAdmin = profile?.role === 'superadmin' || profile?.role === 'admin';

    // Personal Tools State
    const [tools, setTools] = useState([]);
    const [loadingTools, setLoadingTools] = useState(false);
    const [showToolModal, setShowToolModal] = useState(false);
    const [editingTool, setEditingTool] = useState(null);
    const [toolForm, setToolForm] = useState({
        name: '',
        url: '',
        logo_url: '',
        group_name: '',
        notes: '',
        is_pinned: false
    });

    // Communications State
    const [comms, setComms] = useState([]);
    const [loadingComms, setLoadingComms] = useState(false);
    const [showCommModal, setShowCommModal] = useState(false);
    const [editingComm, setEditingComm] = useState(null);
    const [commForm, setCommForm] = useState({
        platform: 'email',
        provider: 'zoho',
        email_address: '',
        account_label: '',
        account_url: '',
        auth_data: {}
    });

    const [initializingVault, setInitializingVault] = useState(false);
    const [migratingDrive, setMigratingDrive] = useState(false);
    const [showFloatingHub, setShowFloatingHub] = useState(localStorage.getItem('show_floating_hub') !== 'false');
    const [customOpenAIKey, setCustomOpenAIKey] = useState(localStorage.getItem('custom_openai_key') || '');

    const logoInputRef = useRef(null);
    const signatureInputRef = useRef(null);
    const paynowInputRef = useRef(null);
    const canvasRef = useRef(null);
    const [showSignaturePad, setShowSignaturePad] = useState(false);
    const [isDrawing, setIsDrawing] = useState(false);

    const handleVaultInit = async () => {
        setInitializingVault(true);
        try {
            const accessToken = localStorage.getItem('google_access_token');
            if (!accessToken) {
                alert('Please connect your Google account in the Communications tab first.');
                return;
            }
            await initializeVault(accessToken, profile.company_id);
            alert('Corporate Vault initialized successfully with year-wise organization!');
        } catch (error) {
            alert('Vault Initialization failed: ' + error.message);
        } finally {
            setInitializingVault(false);
        }
    };

    const handleDriveMigration = async () => {
        if (!confirm('This will move your messy root folders into the CELRONHUB folder to clean up your drive. Proceed?')) return;
        
        setMigratingDrive(true);
        try {
            const accessToken = localStorage.getItem('google_access_token');
            if (!accessToken) throw new Error('Not connected to Google');
            
            const result = await migrateMessyFolders(accessToken, profile.company_id);
            alert(`Migration Complete!\nMoved: ${result.moved.join(', ')}\nErrors: ${result.errors.length}`);
            
            // Re-run vault init to ensure everything is synced
            await handleVaultInit();
        } catch (error) {
            alert('Migration failed: ' + error.message);
        } finally {
            setMigratingDrive(false);
        }
    };

    useEffect(() => {
        if (profile) {
            loadSettings();
            loadTools();
            loadComms();
            // Default to personal for non-admins
            if (!isAdmin) setActiveTab('personal');
            else setActiveTab('company');

            // Handle cross-link tab selection
            const urlParams = new URLSearchParams(window.location.hash.split('?')[1]);
            const tabParam = urlParams.get('tab');
            if (tabParam) setActiveTab(tabParam);
        }
    }, [profile, isAdmin]);

    const loadTools = async () => {
        setLoadingTools(true);
        const { data } = await getUserTools();
        if (data) setTools(data);
        setLoadingTools(false);
    };

    const loadComms = async () => {
        setLoadingComms(true);
        const { data } = await getCommunicationAccounts();
        if (data) setComms(data);
        setLoadingComms(false);
    };

    const loadSettings = async () => {
        setLoading(true);
        try {
            const data = await getDocumentSettings(profile?.company_id);
            if (data) {
                setSettings(data);
            }
        } catch (error) {
            console.error("Failed to load settings:", error);
        }
        setLoading(false);
    };

    const handleSave = async () => {
        if (!profile?.company_id) {
            return alert('Critical Profile Error: Missing Company ID. Please refresh or relog.');
        }

        setSaving(true);
        try {
            const payload = { ...settings };
            if (!payload.company_id) payload.company_id = profile.company_id;

            // Sync with global companies table
            await updateCompany(profile.company_id, {
                name: settings.company_name,
                logo_url: settings.logo_url
            });

            await saveDocumentSettings(payload);
            alert('Settings Saved Successfully! Reloading to apply branding changes...');
            window.location.reload();
        } catch (error) {
            console.error(error);
            alert('Failed to save settings. Make sure you ran the latest Supabase schema updates.');
        }
        setSaving(false);
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        let finalValue = value;

        // Auto-sanitize Google Drive Links to IDs for easier setup
        if (name === 'google_drive_folder_id' && value.includes('drive.google.com')) {
            const match = value.match(/\/folders\/([a-zA-Z0-9_-]+)/) || value.match(/\/d\/([a-zA-Z0-9_-]+)/);
            if (match) finalValue = match[1];
        }

        setSettings(prev => ({ ...prev, [name]: finalValue }));
    };

    const handleFileUpload = async (e, fieldName) => {
        const file = e.target.files[0];
        if (!file) return;

        setSaving(true);
        try {
            // Uploads to a bucket named "company_assets" in a folder "settings"
            const url = await uploadFile('company_assets', 'settings', file, { maxWidth: 800 });
            setSettings(prev => ({ ...prev, [fieldName]: url }));
        } catch (error) {
            console.error('Upload Error:', error);
            alert('Failed to upload. Did you create the "company_assets" bucket in Supabase Storage with Public access enabled?');
        }
        setSaving(false);
    };

    // Signature Pad Logic
    const startDrawing = (e) => {
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const ctx = canvas.getContext('2d');
        const x = (e.clientX || e.touches[0].clientX) - rect.left;
        const y = (e.clientY || e.touches[0].clientY) - rect.top;

        ctx.beginPath();
        ctx.moveTo(x, y);
        setIsDrawing(true);
    };

    const draw = (e) => {
        if (!isDrawing) return;
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const ctx = canvas.getContext('2d');
        const x = (e.clientX || e.touches[0].clientX) - rect.left;
        const y = (e.clientY || e.touches[0].clientY) - rect.top;

        ctx.lineTo(x, y);
        ctx.stroke();
    };

    const stopDrawing = () => {
        setIsDrawing(false);
    };

    const clearCanvas = () => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // Reset context styles after clear
        ctx.strokeStyle = '#1e3a8a';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
    };

    const saveSignaturePad = async () => {
        const canvas = canvasRef.current;
        canvas.toBlob(async (blob) => {
            if (!blob) return;
            const file = new File([blob], 'signature.png', { type: 'image/png' });
            setSaving(true);
            try {
                const url = await uploadFile('company_assets', 'settings', file);
                setSettings(prev => ({ ...prev, signature_url: url }));
                setShowSignaturePad(false);
            } catch (error) {
                console.error(error);
                alert('Failed to save drawn signature');
            }
            setSaving(false);
        }, 'image/png');
    };

    useEffect(() => {
        if (showSignaturePad && canvasRef.current) {
            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d');
            ctx.strokeStyle = '#1e3a8a';
            ctx.lineWidth = 3;
            ctx.lineCap = 'round';
        }
    }, [showSignaturePad]);

    const handleToolSubmit = async (e) => {
        e.preventDefault();
        try {
            let result;
            if (editingTool) {
                result = await updateUserTool(editingTool.id, toolForm);
            } else {
                result = await createUserTool(toolForm);
            }
            if (result.error) throw result.error;

            setShowToolModal(false);
            loadTools();
        } catch (error) {
            console.error(error);
            alert('Failed to save tool');
        }
    };

    const handleDeleteTool = async (id) => {
        if (confirm('Delete this tool?')) {
            const { error } = await deleteUserTool(id);
            if (error) alert('Failed to delete tool: ' + error.message);
            else loadTools();
        }
    };

    const openToolModal = (tool = null) => {
        if (tool) {
            setEditingTool(tool);
            setToolForm({
                name: tool.name,
                url: tool.url,
                logo_url: tool.logo_url || '',
                group_name: tool.group_name || '',
                notes: tool.notes || '',
                is_pinned: tool.is_pinned || false
            });
        } else {
            setEditingTool(null);
            setToolForm({
                name: '',
                url: '',
                logo_url: '',
                group_name: '',
                notes: '',
                is_pinned: false
            });
        }
        setShowToolModal(true);
    };

    // Communication Handlers
    const handleCommSubmit = async (e) => {
        e.preventDefault();
        try {
            let result;
            if (editingComm) {
                result = await updateCommunicationAccount(editingComm.id, commForm);
            } else {
                result = await createCommunicationAccount(commForm);
            }
            if (result.error) throw result.error;

            setShowCommModal(false);
            loadComms();
        } catch (error) {
            console.error(error);
            alert('Failed to save communication account');
        }
    };

    const handleDeleteComm = async (id) => {
        if (confirm('Delete this account?')) {
            const { error } = await deleteCommunicationAccount(id);
            if (error) alert('Failed to delete account: ' + error.message);
            else loadComms();
        }
    };

    const openCommModal = (comm = null) => {
        if (comm) {
            setEditingComm(comm);
            setCommForm({
                platform: comm.platform,
                provider: comm.provider,
                email_address: comm.email_address || '',
                account_label: comm.account_label,
                account_url: comm.account_url || '',
                auth_data: comm.auth_data || {}
            });
        } else {
            setEditingComm(null);
            setCommForm({
                platform: 'email',
                provider: 'zoho',
                email_address: '',
                account_label: '',
                account_url: '',
                auth_data: {}
            });
        }
        setShowCommModal(true);
    };

    if (loading) {
        return <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Loading settings...</div>;
    }

    return (
        <div style={{ background: '#f8fafc', minHeight: '100%', padding: '32px', color: '#334155', borderRadius: '16px' }}>
            <header style={{ marginBottom: '32px' }}>
                <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#1e293b', margin: '0 0 8px 0' }}>Setting</h1>
                <p style={{ margin: 0, color: '#64748b', fontSize: '0.95rem' }}>Personalize your workspace and manage company configurations</p>
            </header>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
                <button
                    onClick={() => setActiveTab('personal')}
                    style={{
                        padding: '10px 20px',
                        borderRadius: '8px',
                        border: 'none',
                        background: activeTab === 'personal' ? '#6366f1' : '#fff',
                        color: activeTab === 'personal' ? '#fff' : '#64748b',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                    }}
                >
                    <User size={18} /> My Personal Tools
                </button>
                <button
                    onClick={() => setActiveTab('communications')}
                    style={{
                        padding: '10px 20px',
                        borderRadius: '8px',
                        border: 'none',
                        background: activeTab === 'communications' ? '#8b5cf6' : '#fff',
                        color: activeTab === 'communications' ? '#fff' : '#64748b',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                    }}
                >
                    <MessageSquare size={18} /> Communications
                </button>
                {isAdmin && (
                    <button
                        onClick={() => setActiveTab('company')}
                        style={{
                            padding: '10px 20px',
                            borderRadius: '8px',
                            border: 'none',
                            background: activeTab === 'company' ? '#6366f1' : '#fff',
                            color: activeTab === 'company' ? '#fff' : '#64748b',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                        }}
                    >
                        <Shield size={18} /> Company Settings
                    </button>
                )}
            </div>

            <div style={{ maxWidth: '900px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {activeTab === 'personal' && (
                    <div className="glass-panel" style={{ padding: '32px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>My Quick Links</h3>
                                <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>Manage your frequently visited websites and tools</p>
                            </div>
                            <button className="btn btn-primary" onClick={() => openToolModal()}>
                                <Plus size={18} /> Add New Tool
                            </button>
                        </div>

                        <div className="table-container" style={{ maxHeight: 'none' }}>
                            <table>
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>Group</th>
                                        <th>Link</th>
                                        <th style={{ textAlign: 'right' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {tools.length === 0 ? (
                                        <tr><td colSpan="4" style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>No tools added yet. Click "Add New Tool" to start pinning your favorite sites.</td></tr>
                                    ) : (
                                        tools.map(tool => (
                                            <tr key={tool.id}>
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                        <div style={{ width: '32px', height: '32px', background: '#f1f5f9', borderRadius: '6px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                            {tool.logo_url ? <img src={tool.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <Globe size={16} color="#94a3b8" />}
                                                        </div>
                                                        <div style={{ fontWeight: 500 }}>{tool.name} {tool.is_pinned && <span style={{ color: '#ec4899', fontSize: '1.2rem' }}>★</span>}</div>
                                                    </div>
                                                </td>
                                                <td><span style={{ padding: '4px 10px', background: '#eff6ff', color: '#2563eb', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 500 }}>{tool.group_name || 'General'}</span></td>
                                                <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    <a href={tool.url} target="_blank" rel="noreferrer" style={{ color: '#6366f1', textDecoration: 'none', fontSize: '0.85rem' }}>{tool.url}</a>
                                                </td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                        <button onClick={() => openToolModal(tool)} style={{ border: 'none', background: 'none', color: '#6366f1', cursor: 'pointer', padding: '4px' }}><Settings size={16} /></button>
                                                        <button onClick={() => handleDeleteTool(tool.id)} style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}><Trash2 size={16} /></button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* App Preferences */}
                        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', padding: '24px', marginTop: '24px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                                <Sparkles size={18} className="text-indigo-600" />
                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>App Preferences</h3>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div style={{ fontSize: '0.95rem', fontWeight: 500, color: '#1e293b' }}>Show Floating Command Hub</div>
                                    <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Display the draggable Drive & AI status hub in project screens</div>
                                </div>
                                <div 
                                    onClick={() => {
                                        const newValue = !showFloatingHub;
                                        setShowFloatingHub(newValue);
                                        localStorage.setItem('show_floating_hub', newValue);
                                    }} 
                                    style={{ cursor: 'pointer', color: showFloatingHub ? '#10b981' : '#cbd5e1', transition: 'all 0.2s' }}
                                >
                                    {showFloatingHub ? <ToggleRight size={36} /> : <ToggleLeft size={36} />}
                                </div>
                            </div>
                            <hr style={{ margin: '16px 0', border: 'none', borderTop: '1px solid #e2e8f0' }} />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div>
                                    <div style={{ fontSize: '0.95rem', fontWeight: 500, color: '#1e293b' }}>OpenAI API Key</div>
                                    <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '8px' }}>Used for business card, invoice, and enquiry scanning. Configured locally in your browser.</div>
                                </div>
                                <div style={{ display: 'flex', gap: '12px' }}>
                                    <input 
                                        type="password"
                                        placeholder="sk-proj-..."
                                        value={customOpenAIKey}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setCustomOpenAIKey(val);
                                            localStorage.setItem('custom_openai_key', val);
                                        }}
                                        style={{ 
                                            flex: 1, 
                                            padding: '8px 12px', 
                                            borderRadius: '6px', 
                                            border: '1px solid #cbd5e1',
                                            fontSize: '0.9rem',
                                            outline: 'none'
                                        }}
                                    />
                                    {customOpenAIKey && (
                                        <button 
                                            onClick={() => {
                                                setCustomOpenAIKey('');
                                                localStorage.removeItem('custom_openai_key');
                                            }}
                                            style={{
                                                padding: '8px 12px',
                                                borderRadius: '6px',
                                                border: '1px solid #ef4444',
                                                background: '#fff',
                                                color: '#ef4444',
                                                cursor: 'pointer',
                                                fontSize: '0.85rem'
                                            }}
                                        >
                                            Clear
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'communications' && (
                    <div className="glass-panel" style={{ padding: '32px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Communication Accounts</h3>
                                <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>Manage your Emails, WhatsApp, and Social Media connections</p>
                            </div>
                            <button className="btn btn-primary" style={{ background: '#8b5cf6' }} onClick={() => openCommModal()}>
                                <Plus size={18} /> Connect New Account
                            </button>
                        </div>

                        <div className="table-container" style={{ maxHeight: 'none' }}>
                            <table>
                                <thead>
                                    <tr>
                                        <th>Label</th>
                                        <th>Platform</th>
                                        <th>Email / Account</th>
                                        <th style={{ textAlign: 'right' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {comms.length === 0 ? (
                                        <tr><td colSpan="4" style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>No communication accounts connected yet. Add your Zoho, Gmail, or Social accounts to centralize your workplace.</td></tr>
                                    ) : (
                                        comms.map(comm => (
                                            <tr key={comm.id}>
                                                <td>
                                                    <div style={{ fontWeight: 600, color: '#1e293b' }}>{comm.account_label}</div>
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span style={{ padding: '4px 10px', background: comm.platform === 'email' ? '#eff6ff' : comm.platform === 'whatsapp' ? '#f0fdf4' : '#faf5ff', color: comm.platform === 'email' ? '#2563eb' : comm.platform === 'whatsapp' ? '#16a34a' : '#9333ea', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase' }}>
                                                            {comm.provider}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td><span style={{ fontSize: '0.85rem' }}>{comm.email_address || 'Connected'}</span></td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                        {comm.provider === 'gmail' && (
                                                            <button
                                                                onClick={() => {
                                                                    import('../lib/googleAuthService').then(m => m.connectGoogleAPI(comm.id, null, comm.email_address));
                                                                }}
                                                                title="Connect Google API"
                                                                style={{
                                                                    background: !isTokenValid() ? '#fff7ed' : '#fef2f2',
                                                                    color: !isTokenValid() ? '#f59e0b' : '#dc2626',
                                                                    cursor: 'pointer',
                                                                    padding: '4px 8px',
                                                                    borderRadius: '4px',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '4px',
                                                                    fontSize: '0.7rem',
                                                                    fontWeight: 700,
                                                                    border: !isTokenValid() ? '1px solid #fdba74' : 'none'
                                                                }}
                                                            >
                                                                <Globe size={14} /> {!isTokenValid() ? 'RECONNECT' : 'Re-sync'}
                                                            </button>
                                                        )}
                                                        <button onClick={() => openCommModal(comm)} style={{ border: 'none', background: 'none', color: '#6366f1', cursor: 'pointer', padding: '4px' }}><Settings size={16} /></button>
                                                        <button onClick={() => handleDeleteComm(comm.id)} style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}><Trash2 size={16} /></button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'company' && isAdmin && (
                    <>
                        {/* Company Information Block */}
                        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', padding: '32px' }}>
                            <h3 style={{ margin: '0 0 24px 0', fontSize: '1.1rem', fontWeight: 600, color: '#1e293b' }}>Company Information</h3>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <label style={{ fontSize: '0.85rem', fontWeight: 500, color: '#1e293b' }}>Company Name</label>
                                    <input type="text" name="company_name" value={settings.company_name || ''} onChange={handleChange} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', color: '#475569', fontSize: '0.95rem' }} />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <label style={{ fontSize: '0.85rem', fontWeight: 500, color: '#1e293b' }}>GST / UEN</label>
                                    <input type="text" name="gst_uen" value={settings.gst_uen || ''} onChange={handleChange} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', color: '#475569', fontSize: '0.95rem' }} />
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', gridColumn: '1 / -1' }}>
                                    <label style={{ fontSize: '0.85rem', fontWeight: 500, color: '#1e293b' }}>Address</label>
                                    <input type="text" name="address" value={settings.address || ''} onChange={handleChange} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', color: '#475569', fontSize: '0.95rem' }} />
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <label style={{ fontSize: '0.85rem', fontWeight: 500, color: '#1e293b' }}>Phone</label>
                                    <input type="text" name="phone" value={settings.phone || ''} onChange={handleChange} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', color: '#475569', fontSize: '0.95rem' }} />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <label style={{ fontSize: '0.85rem', fontWeight: 500, color: '#1e293b' }}>Primary Email</label>
                                    <input type="email" name="email" value={settings.email || ''} onChange={handleChange} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', color: '#475569', fontSize: '0.95rem' }} />
                                </div>
                            </div>
                        </div>

                        {/* Company Communications Block */}
                        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', padding: '32px' }}>
                            <h3 style={{ margin: '0 0 24px 0', fontSize: '1.1rem', fontWeight: 600, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <MessageSquare size={20} className="text-indigo-600" />
                                Communications & Email Sending (SMTP)
                            </h3>
                            <p style={{ margin: '0 0 24px 0', color: '#64748b', fontSize: '0.85rem' }}>Configure the direct integration for automatically sending workflows to customers via email. App Passwords must be generated in your email provider's security settings.</p>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <label style={{ fontSize: '0.85rem', fontWeight: 500, color: '#1e293b' }}>Sales Email (Sent from Workflows)</label>
                                    <input type="email" name="sales_email" value={settings.sales_email || ''} onChange={handleChange} placeholder="Type sales email here..." style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', color: '#475569', fontSize: '0.95rem' }} />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <label style={{ fontSize: '0.85rem', fontWeight: 500, color: '#1e293b' }}>Sales App Password (SMTP)</label>
                                    <input type="password" name="sales_password" value={settings.sales_password || ''} onChange={handleChange} placeholder="e.g. FMYW m2Z8 b1p5" style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', color: '#475569', fontSize: '0.95rem' }} />
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                                    <label style={{ fontSize: '0.85rem', fontWeight: 500, color: '#1e293b' }}>Accounts Email (Sent from Invoices)</label>
                                    <input type="email" name="accounts_email" value={settings.accounts_email || ''} onChange={handleChange} placeholder="Type accounts email here..." style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', color: '#475569', fontSize: '0.95rem' }} />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                                    <label style={{ fontSize: '0.85rem', fontWeight: 500, color: '#1e293b' }}>Accounts App Password (SMTP)</label>
                                    <input type="password" name="accounts_password" value={settings.accounts_password || ''} onChange={handleChange} placeholder="Enter secure App Password" style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', color: '#475569', fontSize: '0.95rem' }} />
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                                    <label style={{ fontSize: '0.85rem', fontWeight: 500, color: '#1e293b' }}>SMTP Host</label>
                                    <input type="text" name="smtp_host" value={settings.smtp_host || ''} onChange={handleChange} placeholder="e.g. smtp.gmail.com" style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', color: '#475569', fontSize: '0.95rem' }} />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                                    <label style={{ fontSize: '0.85rem', fontWeight: 500, color: '#1e293b' }}>SMTP Port</label>
                                    <input type="text" name="smtp_port" value={settings.smtp_port || ''} onChange={handleChange} placeholder="e.g. 465" style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', color: '#475569', fontSize: '0.95rem' }} />
                                </div>

                                <div style={{ gridColumn: '1 / -1', padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.8rem', color: '#64748b' }}>
                                    <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: '4px' }}>Database Synchronization Note</div>
                                    If the passwords fail to save, ensure you have executed the <code>smtp_update.sql</code> script in the Supabase SQL Editor to add the necessary columns.
                                </div>
                            </div>
                        </div>

                        {/* Logo & Signature Block */}
                        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', padding: '32px' }}>
                            <h3 style={{ margin: '0 0 24px 0', fontSize: '1.1rem', fontWeight: 600, color: '#1e293b' }}>Logo & Signature</h3>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '48px' }}>
                                <div>
                                    <label style={{ fontSize: '0.85rem', fontWeight: 500, color: '#1e293b', display: 'block', marginBottom: '12px' }}>Company Logo</label>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                        <div style={{ width: '80px', height: '80px', border: '1px solid #e2e8f0', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px', background: '#f8fafc' }}>
                                            {settings.logo_url ? (
                                                <img src={settings.logo_url} alt="Logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} onError={(e) => { e.target.style.display = 'none'; }} />
                                            ) : (
                                                <div style={{ color: '#cbd5e1', fontSize: '0.7rem' }}>No Logo</div>
                                            )}
                                        </div>
                                        <input type="file" accept="image/*" ref={logoInputRef} style={{ display: 'none' }} onChange={(e) => handleFileUpload(e, 'logo_url')} />
                                        <button onClick={() => logoInputRef.current?.click()} style={{ background: '#fff', color: '#64748b', border: '1px dashed #cbd5e1', padding: '8px 16px', borderRadius: '6px', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <UploadCloud size={16} /> Upload Logo
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label style={{ fontSize: '0.85rem', fontWeight: 500, color: '#1e293b', display: 'block', marginBottom: '12px' }}>Digital Signature</label>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                        <div style={{ width: '120px', height: '80px', border: '1px solid #e2e8f0', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', padding: '4px' }}>
                                            {settings.signature_url ? (
                                                <img src={settings.signature_url} alt="Signature Preview" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} onError={(e) => { e.target.style.display = 'none'; }} />
                                            ) : (
                                                <svg viewBox="0 0 100 40" width="80" height="30" stroke="#cbd5e1" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M10,25 Q20,10 30,25 T50,15 T70,30 T90,10" />
                                                </svg>
                                            )}
                                        </div>
                                        <input type="file" accept="image/*" ref={signatureInputRef} style={{ display: 'none' }} onChange={(e) => handleFileUpload(e, 'signature_url')} />
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            <button onClick={() => signatureInputRef.current?.click()} style={{ background: '#fff', color: '#64748b', border: '1px dashed #cbd5e1', padding: '8px 16px', borderRadius: '6px', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', width: '100%' }}>
                                                <UploadCloud size={16} /> Upload Image
                                            </button>
                                            <button onClick={() => setShowSignaturePad(true)} style={{ background: '#f8fafc', color: '#6366f1', border: '1px solid #e0e7ff', padding: '8px 16px', borderRadius: '6px', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', width: '100%' }}>
                                                <Sparkles size={16} /> Draw Signature
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Payment & Bank Details Block */}
                        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', padding: '32px' }}>
                            <h3 style={{ margin: '0 0 24px 0', fontSize: '1.1rem', fontWeight: 600, color: '#1e293b' }}>Payment & Bank Information</h3>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '48px' }}>
                                <div>
                                    <label style={{ fontSize: '0.85rem', fontWeight: 500, color: '#1e293b', display: 'block', marginBottom: '12px' }}>PayNow QR / Image</label>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                        <div style={{ width: '100px', height: '100px', border: '1px solid #e2e8f0', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px', background: '#f8fafc' }}>
                                            {settings.paynow_url ? (
                                                <img src={settings.paynow_url} alt="PayNow" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                                            ) : (
                                                <div style={{ color: '#cbd5e1', fontSize: '0.7rem', textAlign: 'center' }}>No PayNow Image</div>
                                            )}
                                        </div>
                                        <input type="file" accept="image/*" ref={paynowInputRef} style={{ display: 'none' }} onChange={(e) => handleFileUpload(e, 'paynow_url')} />
                                        <button onClick={() => paynowInputRef.current?.click()} style={{ background: '#fff', color: '#64748b', border: '1px dashed #cbd5e1', padding: '8px 16px', borderRadius: '6px', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <UploadCloud size={16} /> Upload PayNow
                                        </button>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <label style={{ fontSize: '0.85rem', fontWeight: 500, color: '#1e293b' }}>Bank Account Details</label>
                                    <textarea
                                        name="bank_details"
                                        value={settings.bank_details || ''}
                                        onChange={handleChange}
                                        placeholder="Enter Bank Name, Account Number, SWIFT code, etc."
                                        style={{ padding: '12px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', color: '#475569', fontSize: '0.9rem', minHeight: '100px', resize: 'vertical' }}
                                    />
                                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>This information will be displayed on invoices and documents.</span>
                                </div>
                            </div>
                        </div>

                        {/* Watermark Block */}
                        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', padding: '32px' }}>
                            <h3 style={{ margin: '0 0 24px 0', fontSize: '1.1rem', fontWeight: 600, color: '#1e293b' }}>Watermark Settings</h3>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div style={{ fontSize: '0.95rem', fontWeight: 500, color: '#1e293b', marginBottom: '4px' }}>Enable Watermark</div>
                                    <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Show watermark on PDF documents</div>
                                </div>
                                <div onClick={() => setSettings(prev => ({ ...prev, watermark: !prev.watermark }))} style={{ cursor: 'pointer', color: settings.watermark ? '#10b981' : '#cbd5e1', transition: 'all 0.2s' }}>
                                    {settings.watermark ? <ToggleRight size={36} /> : <ToggleLeft size={36} />}
                                </div>
                            </div>
                        </div>

                        {/* Authentication Block */}
                        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', padding: '32px' }}>
                            <h3 style={{ margin: '0 0 24px 0', fontSize: '1.1rem', fontWeight: 600, color: '#1e293b' }}>Authentication Settings</h3>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div style={{ fontSize: '0.95rem', fontWeight: 500, color: '#1e293b', marginBottom: '4px' }}>Allow Public Signup</div>
                                    <div style={{ fontSize: '0.85rem', color: '#64748b' }}>If disabled, the "Sign Up" link will be hidden from the login page.</div>
                                </div>
                                <div onClick={() => setSettings(prev => ({ ...prev, allow_signup: !prev.allow_signup }))} style={{ cursor: 'pointer', color: settings.allow_signup ? '#10b981' : '#cbd5e1', transition: 'all 0.2s' }}>
                                    {settings.allow_signup ? <ToggleRight size={36} /> : <ToggleLeft size={36} />}
                                </div>
                            </div>
                        </div>

                        {/* Google Integration Block */}
                        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', padding: '32px' }}>
                            <h3 style={{ margin: '0 0 24px 0', fontSize: '1.1rem', fontWeight: 600, color: '#1e293b' }}>Google Integration</h3>
                            <p style={{ margin: '0 0 24px 0', color: '#64748b', fontSize: '0.85rem' }}>Personalize storage and schedule for your company. Find these IDs in your Google Drive folder and Calendar settings.</p>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <label style={{ fontSize: '0.85rem', fontWeight: 500, color: '#1e293b' }}>Google Drive Root Folder ID</label>
                                    <input
                                        type="text"
                                        name="google_drive_folder_id"
                                        placeholder="e.g. 1aBC...xyZ"
                                        value={settings.google_drive_folder_id || ''}
                                        onChange={handleChange}
                                        style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', color: '#475569', fontSize: '0.95rem' }}
                                    />
                                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>ID of the `CELRON` root folder in your drive.</span>
                                </div>

                                <div style={{ gridColumn: '1 / -1', marginTop: '16px', padding: '24px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                        <div>
                                            <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <HardDrive size={18} className="text-indigo-600" /> 01-99 Tiered Hierarchy Setup
                                            </h4>
                                            <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>Initialize the consolidated structure: 01. Time Based, 02. Permanent, 03. Short-term, 04. Vault, 99. Scans Inbox.</p>
                                        </div>
                                        <button
                                            onClick={handleVaultInit}
                                            disabled={initializingVault || !settings.google_drive_folder_id}
                                            style={{ padding: '10px 20px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '0.9rem', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', opacity: (initializingVault || !settings.google_drive_folder_id) ? 0.6 : 1 }}
                                        >
                                            {initializingVault ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                                            Sync Tiered Structure
                                        </button>
                                        <button
                                            onClick={handleDriveMigration}
                                            disabled={migratingDrive || !settings.google_drive_folder_id}
                                            style={{ padding: '10px 20px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '0.9rem', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', opacity: (migratingDrive || !settings.google_drive_folder_id) ? 0.6 : 1 }}
                                        >
                                            {migratingDrive ? <Loader2 size={18} className="animate-spin" /> : <HardDrive size={18} />}
                                            Reorganize & Migrate Drive
                                        </button>
                                    </div>

                                    <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
                                        <h5 style={{ margin: '0 0 12px 0', fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>Consolidated Road Map</h5>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '0.75rem', color: '#64748b' }}>
                                            <div style={{ padding: '8px', background: '#fff', borderRadius: '6px', border: '1px solid #e2e8f0' }}><strong>01. TIME_BASED:</strong> Jobs & Expenses (Yearwise)</div>
                                            <div style={{ padding: '8px', background: '#fff', borderRadius: '6px', border: '1px solid #e2e8f0' }}><strong>02. PERMANENT:</strong> Long-term Records</div>
                                            <div style={{ padding: '8px', background: '#fff', borderRadius: '6px', border: '1px solid #e2e8f0' }}><strong>03. SHORT_TERM:</strong> Active Project Loans</div>
                                            <div style={{ padding: '8px', background: '#fff', borderRadius: '6px', border: '1px solid #e2e8f0' }}><strong>04. VAULT:</strong> Standards & Stationery</div>
                                            <div style={{ padding: '8px', background: '#fef2f2', borderRadius: '6px', border: '1px solid #fee2e2', gridColumn: 'span 2' }}>
                                                <strong>99. SCANS_INBOX:</strong> Default landing for Mobile App scans.
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', gridColumn: '2' }}>
                                    <label style={{ fontSize: '0.85rem', fontWeight: 500, color: '#1e293b' }}>Google Calendar ID</label>
                                    <input
                                        type="text"
                                        name="google_calendar_id"
                                        placeholder="e.g. company@gmail.com"
                                        value={settings.google_calendar_id || ''}
                                        onChange={handleChange}
                                        style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', color: '#475569', fontSize: '0.95rem' }}
                                    />
                                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Usually your email address or a shared calendar ID.</span>
                                </div>
                            </div>
                        </div>

                        {/* Save Button */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
                            <button disabled={saving} onClick={handleSave} style={{ background: '#6366f1', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '8px', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                                <Save size={18} /> {saving ? 'Saving...' : 'Save Settings'}
                            </button>
                        </div>
                    </>
                )}
            </div>

            {/* Tool Modal */}
            {showToolModal && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
                    <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '500px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
                        <div style={{ padding: '24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>{editingTool ? 'Edit Tool' : 'Add New Tool'}</h3>
                            <button onClick={() => setShowToolModal(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>✕</button>
                        </div>
                        <form onSubmit={handleToolSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Website Name *</label>
                                <input required type="text" value={toolForm.name} onChange={e => setToolForm({ ...toolForm, name: e.target.value })} placeholder="e.g. Google" style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Website URL *</label>
                                <input required type="url" value={toolForm.url} onChange={e => setToolForm({ ...toolForm, url: e.target.value })} placeholder="https://..." style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Logo URL (Optional)</label>
                                    <input type="text" value={toolForm.logo_url} onChange={e => setToolForm({ ...toolForm, logo_url: e.target.value })} placeholder="Icon URL" style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Group / Category</label>
                                    <input type="text" value={toolForm.group_name} onChange={e => setToolForm({ ...toolForm, group_name: e.target.value })} placeholder="e.g. Search" style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
                                </div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Notes (Username, Password, etc.)</label>
                                <textarea rows="3" value={toolForm.notes} onChange={e => setToolForm({ ...toolForm, notes: e.target.value })} placeholder="Username: admin&#10;Password: ****" style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontFamily: 'monospace' }} />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <input type="checkbox" id="pinned" checked={toolForm.is_pinned} onChange={e => setToolForm({ ...toolForm, is_pinned: e.target.checked })} />
                                <label htmlFor="pinned" style={{ fontSize: '0.85rem', fontWeight: 500 }}>Pin to favorites</label>
                            </div>
                            <div style={{ marginTop: '12px', display: 'flex', gap: '12px' }}>
                                <button type="button" onClick={() => setShowToolModal(false)} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}>Cancel</button>
                                <button type="submit" style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', background: '#6366f1', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>{editingTool ? 'Update Tool' : 'Add Tool'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {/* Communication Modal */}
            {showCommModal && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
                    <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '500px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
                        <div style={{ padding: '24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>{editingComm ? 'Edit Account' : 'Connect Account'}</h3>
                            <button onClick={() => setShowCommModal(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>✕</button>
                        </div>
                        <form onSubmit={handleCommSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Platform / Provider *</label>
                                <select
                                    value={commForm.provider}
                                    onChange={e => {
                                        const prov = e.target.value;
                                        let platform = 'social';
                                        if (['zoho', 'gmail'].includes(prov)) platform = 'email';
                                        if (prov === 'whatsapp') platform = 'whatsapp';
                                        setCommForm({ ...commForm, provider: prov, platform });
                                    }}
                                    style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                                >
                                    <optgroup label="Email">
                                        <option value="zoho">Zoho Mail</option>
                                        <option value="gmail">Gmail</option>
                                    </optgroup>
                                    <optgroup label="Messaging">
                                        <option value="whatsapp">WhatsApp Business</option>
                                        <option value="wechat">WeChat</option>
                                        <option value="botim">Botim</option>
                                    </optgroup>
                                    <optgroup label="Social">
                                        <option value="facebook">Facebook</option>
                                        <option value="instagram">Instagram</option>
                                        <option value="twitter">X (Twitter)</option>
                                        <option value="linkedin">LinkedIn</option>
                                        <option value="youtube">YouTube</option>
                                        <option value="tiktok">TikTok</option>
                                    </optgroup>
                                </select>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Account Label *</label>
                                <input required type="text" value={commForm.account_label} onChange={e => setCommForm({ ...commForm, account_label: e.target.value })} placeholder="e.g. Sales Account, Personal FB" style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Email Address / Username</label>
                                <input type="text" value={commForm.email_address} onChange={e => setCommForm({ ...commForm, email_address: e.target.value })} placeholder="email@example.com" style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
                            </div>

                            {commForm.platform === 'email' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>App Password (SMTP Integration)</label>
                                    <input
                                        type="password"
                                        value={commForm.auth_data?.password || ''}
                                        onChange={e => setCommForm({ ...commForm, auth_data: { ...commForm.auth_data, password: e.target.value } })}
                                        placeholder="Enter secure app password"
                                        style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                                    />
                                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Used by the application to automatically send PDFs and notifications on your behalf.</span>
                                </div>
                            )}

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Portal URL (Auto-link)</label>
                                <input type="url" value={commForm.account_url} onChange={e => setCommForm({ ...commForm, account_url: e.target.value })} placeholder="https://mail.zoho.com" style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
                            </div>

                            <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.8rem', color: '#64748b' }}>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px', fontWeight: 600, color: '#1e293b' }}>
                                    <Share2 size={14} /> Security Note
                                </div>
                                Authentication for full API features (OAuth) will be handled in the next step. For now, this entry creates the dashboard link.
                            </div>

                            <div style={{ marginTop: '12px', display: 'flex', gap: '12px' }}>
                                <button type="button" onClick={() => setShowCommModal(false)} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}>Cancel</button>
                                <button type="submit" style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', background: '#8b5cf6', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>{editingComm ? 'Update Account' : 'Connect Account'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Signature Pad Modal */}
            {showSignaturePad && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', backdropFilter: 'blur(4px)' }}>
                    <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '600px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', overflow: 'hidden' }}>
                        <div style={{ padding: '24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#1e3a8a' }}>Digital Signature Pad</h3>
                                <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>Draw your signature using your mouse or touch screen</p>
                            </div>
                            <button onClick={() => setShowSignaturePad(false)} style={{ background: '#fff', border: '1px solid #e2e8f0', color: '#94a3b8', cursor: 'pointer', padding: '8px', borderRadius: '8px', display: 'flex' }}>✕</button>
                        </div>

                        <div style={{ padding: '32px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px' }}>
                            <div style={{ width: '100%', background: '#fff', border: '2px dashed #cbd5e1', borderRadius: '12px', overflow: 'hidden', cursor: 'crosshair', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.05)' }}>
                                <canvas
                                    ref={canvasRef}
                                    width={500}
                                    height={200}
                                    onMouseDown={startDrawing}
                                    onMouseMove={draw}
                                    onMouseUp={stopDrawing}
                                    onMouseLeave={stopDrawing}
                                    onTouchStart={startDrawing}
                                    onTouchMove={draw}
                                    onTouchEnd={stopDrawing}
                                    style={{ display: 'block', maxWidth: '100%', height: 'auto', margin: '0 auto' }}
                                />
                            </div>

                            <div style={{ display: 'flex', gap: '16px', width: '100%' }}>
                                <button
                                    onClick={clearCanvas}
                                    style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid #cbd5e1', background: '#fff', color: '#64748b', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
                                    onMouseOver={(e) => e.target.style.background = '#f8fafc'}
                                    onMouseOut={(e) => e.target.style.background = '#fff'}
                                >
                                    Clear Canvas
                                </button>
                                <button
                                    onClick={saveSignaturePad}
                                    disabled={saving}
                                    style={{ flex: 2, padding: '12px', borderRadius: '10px', border: 'none', background: '#6366f1', color: '#fff', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: saving ? 0.7 : 1 }}
                                >
                                    {saving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
                                    Save Signature
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
