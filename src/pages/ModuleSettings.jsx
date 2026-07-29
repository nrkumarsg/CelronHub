import React, { useState, useEffect, useRef } from 'react';
import { 
    Settings, UploadCloud, ToggleRight, ToggleLeft, Save, Plus, Globe, Trash2, 
    ExternalLink, Shield, User, MessageSquare, Share2, HardDrive, Sparkles, Loader2,
    Cpu, Key, Eye, EyeOff, RefreshCw, CheckCircle2, XCircle, Info, HelpCircle
} from 'lucide-react';
import { getDocumentSettings, saveDocumentSettings, uploadFile } from '../lib/store';
import { getUserTools, createUserTool, updateUserTool, deleteUserTool } from '../lib/toolService';
import { getCommunicationAccounts, createCommunicationAccount, updateCommunicationAccount, deleteCommunicationAccount } from '../lib/communicationService';
import { initializeVault, migrateMessyFolders } from '../lib/vaultService';
import { updateCompany } from '../lib/companyService';
import { useAuth } from '../contexts/AuthContext';
import { isTokenValid } from '../lib/googleAuthService';

// AI configuration imports
import { 
    getProviders, saveProvider, getEncryptedApiKey, saveApiKey, deleteApiKey, resetToDefaults 
} from '../lib/ai/configService';
import { testProviderConnection } from '../lib/ai/testConnection';

import toast from 'react-hot-toast';

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
        google_drive_folder_id: 'https://drive.google.com/drive/folders/1Bui_mkB4d3Ae9Ll-3UHlWXYAauJz-d3w?usp=drive_link',
        google_calendar_id: '',
        paynow_url: '',
        bank_details: ''
    });

    const { profile } = useAuth();
    const [activeTab, setActiveTab] = useState('general'); // 'general', 'appearance', 'ai_providers', 'api_keys', 'database', 'security', 'about', 'my_links'
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

    // AI Providers and API Keys State
    const [providers, setProviders] = useState([]);
    const [selectedProvider, setSelectedProvider] = useState(null);
    const [apiKeys, setApiKeys] = useState({}); // { DeepSeek: '••••••••', Gemini: '' }
    const [visibleKeys, setVisibleKeys] = useState({}); // { DeepSeek: false }
    const [testingProvider, setTestingProvider] = useState({}); // { DeepSeek: false }
    const [testResults, setTestResults] = useState({}); // { DeepSeek: { success: true, latency: 120 } }

    // Ollama models state
    const [ollamaModels, setOllamaModels] = useState([]);
    const [fetchingOllamaModels, setFetchingOllamaModels] = useState(false);
    const [newOllamaModelName, setNewOllamaModelName] = useState('');
    const [pullingModel, setPullingModel] = useState(false);

    const logoInputRef = useRef(null);
    const signatureInputRef = useRef(null);
    const paynowInputRef = useRef(null);
    const canvasRef = useRef(null);
    const [showSignaturePad, setShowSignaturePad] = useState(false);
    const [isDrawing, setIsDrawing] = useState(false);

    // Initial Load
    useEffect(() => {
        async function loadAll() {
            setLoading(true);
            try {
                // Load Company / App Settings
                const docSettings = await getDocumentSettings();
                if (docSettings) {
                    setSettings(prev => ({
                        ...prev,
                        ...docSettings
                    }));
                }

                // Load Personal Tools
                await loadTools();

                // Load Comms
                await loadComms();

                // Load AI configs
                const list = getProviders();
                setProviders(list);
                if (list.length > 0) {
                    setSelectedProvider(list[0]);
                }

                // Map Masked Keys
                const keys = {};
                for (const p of list) {
                    const enc = getEncryptedApiKey(p.name);
                    if (enc) {
                        keys[p.name] = '••••••••••••••••';
                    } else {
                        keys[p.name] = '';
                    }
                }
                setApiKeys(keys);

            } catch (err) {
                console.error("Failed to load settings:", err);
                toast.error("Error loading settings");
            } finally {
                setLoading(false);
            }
        }
        loadAll();
    }, []);

    const loadTools = async () => {
        setLoadingTools(true);
        try {
            const { data } = await getUserTools();
            if (data) setTools(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingTools(false);
        }
    };

    const loadComms = async () => {
        setLoadingComms(true);
        try {
            const { data } = await getCommunicationAccounts();
            if (data) setComms(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingComms(false);
        }
    };

    // Form input handlers
    const handleChange = (e) => {
        const { name, value } = e.target;
        setSettings(prev => ({ ...prev, [name]: value }));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            // Save Document settings to database
            const ok = await saveDocumentSettings(settings);
            // Save Company Profile details if admin
            if (isAdmin) {
                await updateCompany(profile.company_id, {
                    name: settings.company_name,
                    uen: settings.gst_uen,
                    address: settings.address,
                    phone: settings.phone,
                    email: settings.email
                });
            }
            if (ok) {
                toast.success('Settings saved successfully!');
            } else {
                toast.error('Failed to save settings');
            }
        } catch (error) {
            console.error(error);
            toast.error('Error saving settings: ' + error.message);
        } finally {
            setSaving(false);
        }
    };

    const handleFileUpload = async (e, fieldName) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setSaving(true);
        try {
            const url = await uploadFile('company_assets', 'settings', file, { maxWidth: 800 });
            setSettings(prev => ({ ...prev, [fieldName]: url }));
            toast.success("Asset uploaded successfully");
        } catch (error) {
            console.error('Upload Error:', error);
            toast.error('Failed to upload asset');
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
                toast.success("Signature saved!");
            } catch (error) {
                console.error(error);
                toast.error('Failed to save signature');
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

    // Tool Submission
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
            toast.success("Tool saved!");
        } catch (error) {
            console.error(error);
            toast.error('Failed to save tool');
        }
    };

    const handleDeleteTool = async (id) => {
        if (confirm('Delete this tool?')) {
            const { error } = await deleteUserTool(id);
            if (error) toast.error('Failed to delete tool: ' + error.message);
            else {
                loadTools();
                toast.success("Tool deleted");
            }
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

    // Communication Accounts
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
            toast.success("Communication connection saved!");
        } catch (error) {
            console.error(error);
            toast.error('Failed to save account');
        }
    };

    const handleDeleteComm = async (id) => {
        if (confirm('Delete this account?')) {
            const { error } = await deleteCommunicationAccount(id);
            if (error) toast.error('Failed to delete account: ' + error.message);
            else {
                loadComms();
                toast.success("Account deleted");
            }
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

    // Google Vault Sync
    const handleVaultInit = async () => {
        setInitializingVault(true);
        try {
            const accessToken = localStorage.getItem('google_access_token');
            if (!accessToken) {
                toast.error('Please connect your Google account in the General (SMTP) settings first.');
                return;
            }
            await initializeVault(accessToken, profile.company_id);
            toast.success('Corporate Vault initialized successfully with year-wise organization!');
        } catch (error) {
            toast.error('Vault Initialization failed: ' + error.message);
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
            toast.success(`Migration Complete! Moved: ${result.moved.length} folders.`);
        } catch (error) {
            toast.error('Migration failed: ' + error.message);
        } finally {
            setMigratingDrive(false);
        }
    };

    // AI Configuration Operations
    const handleSaveProviderSettings = () => {
        if (!selectedProvider) return;
        saveProvider(selectedProvider);
        
        // Refresh local providers list
        const updated = getProviders();
        setProviders(updated);
        toast.success(`"${selectedProvider.name}" configurations saved!`);
    };

    const handleSaveApiKey = async (providerName) => {
        const keyVal = apiKeys[providerName];
        if (keyVal === '••••••••••••••••') {
            toast.error("Please enter a new key value first.");
            return;
        }

        try {
            await saveApiKey(providerName, keyVal);
            if (providerName.toLowerCase() === 'openai') {
                // Sync to custom_openai_key for old modules compatibility
                localStorage.setItem('custom_openai_key', keyVal);
            }
            toast.success(`API Key for ${providerName} saved securely!`);
        } catch (e) {
            toast.error("Encryption failed: " + e.message);
        }
    };

    const handleDeleteApiKey = (providerName) => {
        if (confirm(`Delete the saved API Key for ${providerName}?`)) {
            deleteApiKey(providerName);
            setApiKeys(prev => ({ ...prev, [providerName]: '' }));
            if (providerName.toLowerCase() === 'openai') {
                localStorage.removeItem('custom_openai_key');
            }
            toast.success(`API Key for ${providerName} removed.`);
        }
    };

    const toggleKeyVisibility = async (providerName) => {
        const isVisible = visibleKeys[providerName];
        if (isVisible) {
            setVisibleKeys(prev => ({ ...prev, [providerName]: false }));
            setApiKeys(prev => ({ ...prev, [providerName]: '••••••••••••••••' }));
        } else {
            const realKey = await getEncryptedApiKey(providerName);
            setVisibleKeys(prev => ({ ...prev, [providerName]: true }));
            
            if (realKey) {
                // Decrypt key for visibility
                import('../lib/ai/cryptoHelper').then(async m => {
                    const decrypted = await m.decryptKey(realKey);
                    setApiKeys(prev => ({ ...prev, [providerName]: decrypted }));
                });
            } else {
                setApiKeys(prev => ({ ...prev, [providerName]: '' }));
            }
        }
    };

    const handleTestProvider = async (providerName) => {
        setTestingProvider(prev => ({ ...prev, [providerName]: true }));
        setTestResults(prev => ({ ...prev, [providerName]: null }));

        try {
            let keyToTest = apiKeys[providerName];
            if (keyToTest === '••••••••••••••••') {
                // retrieve real key
                const enc = getEncryptedApiKey(providerName);
                if (enc) {
                    const m = await import('../lib/ai/cryptoHelper');
                    keyToTest = await m.decryptKey(enc);
                } else {
                    keyToTest = '';
                }
            }
            
            const target = providers.find(p => p.name === providerName);
            const res = await testProviderConnection(target, keyToTest);
            setTestResults(prev => ({ ...prev, [providerName]: res }));
            
            if (res.success) {
                toast.success(`${providerName} test successful!`);
            } else {
                toast.error(`${providerName} test failed: ${res.message}`);
            }
        } catch (err) {
            setTestResults(prev => ({ ...prev, [providerName]: { success: false, message: err.message } }));
            toast.error("Test execution failed: " + err.message);
        } finally {
            setTestingProvider(prev => ({ ...prev, [providerName]: false }));
        }
    };

    // Fetch installed Ollama models
    const fetchLocalOllamaModels = async (baseUrl) => {
        setFetchingOllamaModels(true);
        try {
            const res = await fetch(`${baseUrl}/api/tags`);
            if (res.ok) {
                const data = await res.json();
                setOllamaModels(data.models || []);
            } else {
                setOllamaModels([]);
            }
        } catch (err) {
            console.warn("Could not fetch local Ollama models list (likely CORS or not running).");
            setOllamaModels([]);
        } finally {
            setFetchingOllamaModels(false);
        }
    };

    const handlePullOllamaModel = async () => {
        if (!newOllamaModelName) return toast.error("Please enter a model name to pull.");
        setPullingModel(true);
        const loadingToast = toast.loading(`Pulling model "${newOllamaModelName}" from Ollama... This takes a few minutes.`);
        
        try {
            const res = await fetch(`${selectedProvider.baseUrl}/api/pull`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newOllamaModelName, stream: false })
            });
            
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || `Status ${res.status}`);
            }
            
            toast.dismiss(loadingToast);
            toast.success(`Successfully pulled/added model "${newOllamaModelName}"!`);
            setNewOllamaModelName('');
            fetchLocalOllamaModels(selectedProvider.baseUrl);
        } catch (err) {
            toast.dismiss(loadingToast);
            toast.error("Failed to pull model: " + err.message);
        } finally {
            setPullingModel(false);
        }
    };

    useEffect(() => {
        if (selectedProvider && selectedProvider.name === 'Ollama') {
            fetchLocalOllamaModels(selectedProvider.baseUrl);
        }
    }, [selectedProvider]);

    const handleResetAI = () => {
        if (confirm("Reset all AI configurations to standard factory defaults? Saved keys will be deleted.")) {
            resetToDefaults();
            localStorage.removeItem('custom_openai_key');
            
            // Reload
            const list = getProviders();
            setProviders(list);
            setSelectedProvider(list[0]);
            
            const keys = {};
            list.forEach(p => { keys[p.name] = ''; });
            setApiKeys(keys);
            toast.success("AI Configuration reset successful.");
        }
    };

    if (loading) {
        return <div style={{ padding: '80px 40px', textAlign: 'center', color: '#94a3b8' }}>
            <Loader2 size={36} className="animate-spin" style={{ margin: '0 auto 16px', color: '#6366f1' }} />
            <span>Loading CelronHub configuration module...</span>
        </div>;
    }

    return (
        <div style={{ background: '#f8fafc', minHeight: '100%', padding: '32px', color: '#334155', borderRadius: '16px' }}>
            <header style={{ marginBottom: '32px' }}>
                <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#1e293b', margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Settings size={28} className="text-indigo-600" /> Settings Panel
                </h1>
                <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>Control workspace tools, configure AI provider priority fallbacks, and manage APIs</p>
            </header>

            {/* Vertical Split-Layout Settings */}
            <div style={{ display: 'flex', gap: '32px', alignItems: 'flex-start' }}>
                
                {/* Left Sidebar Navigation */}
                <div style={{ width: '240px', flexShrink: 0, background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <button
                        onClick={() => setActiveTab('general')}
                        style={{
                            padding: '12px 16px', borderRadius: '10px', border: 'none',
                            background: activeTab === 'general' ? '#e0e7ff' : 'transparent',
                            color: activeTab === 'general' ? '#4f46e5' : '#475569',
                            fontWeight: activeTab === 'general' ? 700 : 500,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', width: '100%', textAlign: 'left', transition: 'all 0.15s'
                        }}
                    >
                        <User size={18} /> General Profile & SMTP
                    </button>

                    <button
                        onClick={() => setActiveTab('appearance')}
                        style={{
                            padding: '12px 16px', borderRadius: '10px', border: 'none',
                            background: activeTab === 'appearance' ? '#e0e7ff' : 'transparent',
                            color: activeTab === 'appearance' ? '#4f46e5' : '#475569',
                            fontWeight: activeTab === 'appearance' ? 700 : 500,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', width: '100%', textAlign: 'left', transition: 'all 0.15s'
                        }}
                    >
                        <Sparkles size={18} /> Appearance & Design
                    </button>

                    <button
                        onClick={() => setActiveTab('ai_providers')}
                        style={{
                            padding: '12px 16px', borderRadius: '10px', border: 'none',
                            background: activeTab === 'ai_providers' ? '#e0e7ff' : 'transparent',
                            color: activeTab === 'ai_providers' ? '#4f46e5' : '#475569',
                            fontWeight: activeTab === 'ai_providers' ? 700 : 500,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', width: '100%', textAlign: 'left', transition: 'all 0.15s'
                        }}
                    >
                        <Cpu size={18} /> AI Providers
                    </button>

                    <button
                        onClick={() => setActiveTab('api_keys')}
                        style={{
                            padding: '12px 16px', borderRadius: '10px', border: 'none',
                            background: activeTab === 'api_keys' ? '#e0e7ff' : 'transparent',
                            color: activeTab === 'api_keys' ? '#4f46e5' : '#475569',
                            fontWeight: activeTab === 'api_keys' ? 700 : 500,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', width: '100%', textAlign: 'left', transition: 'all 0.15s'
                        }}
                    >
                        <Key size={18} /> API Keys Encryption
                    </button>

                    <button
                        onClick={() => setActiveTab('database')}
                        style={{
                            padding: '12px 16px', borderRadius: '10px', border: 'none',
                            background: activeTab === 'database' ? '#e0e7ff' : 'transparent',
                            color: activeTab === 'database' ? '#4f46e5' : '#475569',
                            fontWeight: activeTab === 'database' ? 700 : 500,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', width: '100%', textAlign: 'left', transition: 'all 0.15s'
                        }}
                    >
                        <HardDrive size={18} /> Database & Storage
                    </button>

                    <button
                        onClick={() => setActiveTab('security')}
                        style={{
                            padding: '12px 16px', borderRadius: '10px', border: 'none',
                            background: activeTab === 'security' ? '#e0e7ff' : 'transparent',
                            color: activeTab === 'security' ? '#4f46e5' : '#475569',
                            fontWeight: activeTab === 'security' ? 700 : 500,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', width: '100%', textAlign: 'left', transition: 'all 0.15s'
                        }}
                    >
                        <Shield size={18} /> System Security
                    </button>

                    <button
                        onClick={() => setActiveTab('my_links')}
                        style={{
                            padding: '12px 16px', borderRadius: '10px', border: 'none',
                            background: activeTab === 'my_links' ? '#e0e7ff' : 'transparent',
                            color: activeTab === 'my_links' ? '#4f46e5' : '#475569',
                            fontWeight: activeTab === 'my_links' ? 700 : 500,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', width: '100%', textAlign: 'left', transition: 'all 0.15s'
                        }}
                    >
                        <Globe size={18} /> My Personal Links
                    </button>

                    <button
                        onClick={() => setActiveTab('about')}
                        style={{
                            padding: '12px 16px', borderRadius: '10px', border: 'none',
                            background: activeTab === 'about' ? '#e0e7ff' : 'transparent',
                            color: activeTab === 'about' ? '#4f46e5' : '#475569',
                            fontWeight: activeTab === 'about' ? 700 : 500,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', width: '100%', textAlign: 'left', transition: 'all 0.15s'
                        }}
                    >
                        <Settings size={18} /> About Engine
                    </button>
                </div>

                {/* Right Content Panel */}
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    
                    {/* TAB: GENERAL */}
                    {activeTab === 'general' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                            {/* Company Information Block */}
                            <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '32px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                <h3 style={{ margin: '0 0 24px 0', fontSize: '1.1rem', fontWeight: 700, color: '#1e293b' }}>Company Information</h3>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Company Name</label>
                                        <input type="text" name="company_name" value={settings.company_name || ''} onChange={handleChange} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none' }} />
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>GST / UEN</label>
                                        <input type="text" name="gst_uen" value={settings.gst_uen || ''} onChange={handleChange} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none' }} />
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', gridColumn: '1 / -1' }}>
                                        <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Address</label>
                                        <input type="text" name="address" value={settings.address || ''} onChange={handleChange} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none' }} />
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Phone</label>
                                        <input type="text" name="phone" value={settings.phone || ''} onChange={handleChange} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none' }} />
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Primary Email</label>
                                        <input type="email" name="email" value={settings.email || ''} onChange={handleChange} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none' }} />
                                    </div>
                                </div>
                            </div>

                            {/* SMTP Communications Block */}
                            <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '32px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <MessageSquare size={20} className="text-indigo-600" /> SMTP Outbound Email Services
                                </h3>
                                <p style={{ margin: '0 0 24px 0', color: '#64748b', fontSize: '0.82rem' }}>Outbound SMTP credentials used to dispatch quotations/invoices. App Passwords must be generated in Google/Zoho Security Settings.</p>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Sales Email</label>
                                        <input type="email" name="sales_email" value={settings.sales_email || ''} onChange={handleChange} placeholder="sales@company.com" style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none' }} />
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Sales App Password (SMTP)</label>
                                        <input type="password" name="sales_password" value={settings.sales_password || ''} onChange={handleChange} placeholder="App password" style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none' }} />
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Accounts Email</label>
                                        <input type="email" name="accounts_email" value={settings.accounts_email || ''} onChange={handleChange} placeholder="accounts@company.com" style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none' }} />
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Accounts App Password (SMTP)</label>
                                        <input type="password" name="accounts_password" value={settings.accounts_password || ''} onChange={handleChange} placeholder="App password" style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none' }} />
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>SMTP Host</label>
                                        <input type="text" name="smtp_host" value={settings.smtp_host || ''} onChange={handleChange} placeholder="smtp.zoho.com" style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none' }} />
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>SMTP Port</label>
                                        <input type="text" name="smtp_port" value={settings.smtp_port || ''} onChange={handleChange} placeholder="465" style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none' }} />
                                    </div>
                                </div>
                            </div>

                            {/* Logo & Signature Block */}
                            <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '32px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                <h3 style={{ margin: '0 0 24px 0', fontSize: '1.1rem', fontWeight: 700, color: '#1e293b' }}>Logo & Signature Assets</h3>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '48px' }}>
                                    <div>
                                        <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '12px' }}>Company Logo</label>
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
                                        <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '12px' }}>Digital Signature</label>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                            <div style={{ width: '120px', height: '80px', border: '1px solid #e2e8f0', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', padding: '4px' }}>
                                                {settings.signature_url ? (
                                                    <img src={settings.signature_url} alt="Signature Preview" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} onError={(e) => { e.target.style.display = 'none'; }} />
                                                ) : (
                                                    <div style={{ color: '#cbd5e1', fontSize: '0.7rem' }}>No Signature</div>
                                                )}
                                            </div>
                                            <input type="file" accept="image/*" ref={signatureInputRef} style={{ display: 'none' }} onChange={(e) => handleFileUpload(e, 'signature_url')} />
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                <button onClick={() => signatureInputRef.current?.click()} style={{ background: '#fff', color: '#64748b', border: '1px dashed #cbd5e1', padding: '8px 16px', borderRadius: '6px', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <UploadCloud size={16} /> Upload
                                                </button>
                                                <button onClick={() => setShowSignaturePad(true)} style={{ background: '#f8fafc', color: '#6366f1', border: '1px solid #e0e7ff', padding: '8px 16px', borderRadius: '6px', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <Sparkles size={16} /> Draw
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Paynow QR & Bank Account */}
                            <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '32px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                <h3 style={{ margin: '0 0 24px 0', fontSize: '1.1rem', fontWeight: 700, color: '#1e293b' }}>Payment QR & Bank Details</h3>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '48px' }}>
                                    <div>
                                        <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '12px' }}>PayNow QR Image</label>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                            <div style={{ width: '100px', height: '100px', border: '1px solid #e2e8f0', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px', background: '#f8fafc' }}>
                                                {settings.paynow_url ? (
                                                    <img src={settings.paynow_url} alt="PayNow QR" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                                                ) : (
                                                    <div style={{ color: '#cbd5e1', fontSize: '0.7rem' }}>No Image</div>
                                                )}
                                            </div>
                                            <input type="file" accept="image/*" ref={paynowInputRef} style={{ display: 'none' }} onChange={(e) => handleFileUpload(e, 'paynow_url')} />
                                            <button onClick={() => paynowInputRef.current?.click()} style={{ background: '#fff', color: '#64748b', border: '1px dashed #cbd5e1', padding: '8px 16px', borderRadius: '6px', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <UploadCloud size={16} /> Upload PayNow
                                            </button>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Bank Account Details</label>
                                        <textarea
                                            name="bank_details"
                                            value={settings.bank_details || ''}
                                            onChange={handleChange}
                                            placeholder="Enter Bank Name, Account Number, SWIFT code, etc."
                                            style={{ padding: '12px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.85rem', minHeight: '80px', resize: 'vertical' }}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Communication Platforms Listing */}
                            <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '32px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Social Communications Connections</h3>
                                        <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>Configure communication channels and message links</p>
                                    </div>
                                    <button className="btn btn-primary" onClick={() => openCommModal()}>
                                        <Plus size={16} /> Connect Account
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
                                                <tr><td colSpan="4" style={{ textAlign: 'center', padding: '30px', color: '#cbd5e1' }}>No social channels connected.</td></tr>
                                            ) : (
                                                comms.map(comm => (
                                                    <tr key={comm.id}>
                                                        <td><div style={{ fontWeight: 600 }}>{comm.account_label}</div></td>
                                                        <td>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                <span style={{ padding: '4px 10px', background: '#f1f5f9', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase' }}>
                                                                    {comm.provider}
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td><span style={{ fontSize: '0.85rem' }}>{comm.email_address || 'Linked'}</span></td>
                                                        <td style={{ textAlign: 'right' }}>
                                                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center' }}>
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
                                                                <button onClick={() => openCommModal(comm)} style={{ border: 'none', background: 'none', color: '#6366f1', cursor: 'pointer' }}><Settings size={16} /></button>
                                                                <button onClick={() => handleDeleteComm(comm.id)} style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer' }}><Trash2 size={16} /></button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Save General Settings Button */}
                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                <button disabled={saving} onClick={handleSave} style={{ background: '#4f46e5', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '8px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                    <Save size={18} /> {saving ? 'Saving...' : 'Save General Settings'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* TAB: APPEARANCE */}
                    {activeTab === 'appearance' && (
                        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '32px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                            <h3 style={{ margin: '0 0 24px 0', fontSize: '1.1rem', fontWeight: 700, color: '#1e293b' }}>Appearance & Interface Settings</h3>
                            
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1e293b' }}>Show Floating Command Hub</div>
                                    <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Display the draggable Drive & AI status hub in project screens</div>
                                </div>
                                <div 
                                    onClick={() => {
                                        const newValue = !showFloatingHub;
                                        setShowFloatingHub(newValue);
                                        localStorage.setItem('show_floating_hub', newValue);
                                        toast.success("Command Hub visibility updated");
                                    }} 
                                    style={{ cursor: 'pointer', color: showFloatingHub ? '#10b981' : '#cbd5e1', transition: 'all 0.2s' }}
                                >
                                    {showFloatingHub ? <ToggleRight size={36} /> : <ToggleLeft size={36} />}
                                </div>
                            </div>
                            
                            <hr style={{ margin: '24px 0', border: 'none', borderTop: '1px solid #e2e8f0' }} />
                            
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1e293b' }}>Enable Document Watermark</div>
                                    <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Show company watermarks on printed PDF files</div>
                                </div>
                                <div 
                                    onClick={() => setSettings(prev => ({ ...prev, watermark: !prev.watermark }))} 
                                    style={{ cursor: 'pointer', color: settings.watermark ? '#10b981' : '#cbd5e1', transition: 'all 0.2s' }}
                                >
                                    {settings.watermark ? <ToggleRight size={36} /> : <ToggleLeft size={36} />}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB: AI PROVIDERS */}
                    {activeTab === 'ai_providers' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                            <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '32px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', fontWeight: 700, color: '#1e293b' }}>AI Provider Profiles</h3>
                                <p style={{ margin: '0 0 24px 0', color: '#64748b', fontSize: '0.82rem' }}>Configure priority sequences, endpoints, models, temperatures, and timeouts for fallback triggers.</p>

                                <div style={{ display: 'flex', gap: '24px', minHeight: '350px' }}>
                                    {/* Left Split List */}
                                    <div style={{ width: '220px', borderRight: '1px solid #e2e8f0', paddingRight: '16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '8px' }}>Active Providers</div>
                                        {providers.map(p => (
                                            <button
                                                key={p.name}
                                                onClick={() => setSelectedProvider(p)}
                                                style={{
                                                    padding: '10px 12px', borderRadius: '8px', border: selectedProvider?.name === p.name ? '1px solid #cbd5e1' : 'none',
                                                    background: selectedProvider?.name === p.name ? '#f8fafc' : 'transparent',
                                                    color: p.enabled ? '#1e293b' : '#94a3b8',
                                                    fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', textAlign: 'left',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                                                }}
                                            >
                                                <span>{p.priority}. {p.name}</span>
                                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: p.enabled ? '#10b981' : '#cbd5e1' }} />
                                            </button>
                                        ))}
                                    </div>

                                    {/* Right Split Settings Form */}
                                    {selectedProvider ? (
                                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
                                                <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>{selectedProvider.name} Settings</h4>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <input 
                                                        type="checkbox" 
                                                        id={`enabled-${selectedProvider.name}`}
                                                        checked={selectedProvider.enabled}
                                                        onChange={e => setSelectedProvider({ ...selectedProvider, enabled: e.target.checked })}
                                                    />
                                                    <label htmlFor={`enabled-${selectedProvider.name}`} style={{ fontSize: '0.8rem', fontWeight: 600 }}>Enabled</label>
                                                </div>
                                            </div>

                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                    <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Priority Order (1-9)</label>
                                                    <input 
                                                        type="number" 
                                                        min="1" 
                                                        max="9" 
                                                        value={selectedProvider.priority}
                                                        onChange={e => setSelectedProvider({ ...selectedProvider, priority: parseInt(e.target.value) || 1 })}
                                                        style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                                                    />
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                    <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Model Name</label>
                                                    <input 
                                                        type="text" 
                                                        value={selectedProvider.modelName}
                                                        onChange={e => setSelectedProvider({ ...selectedProvider, modelName: e.target.value })}
                                                        style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                                                    />
                                                </div>

                                                {selectedProvider.name === 'Ollama' && (
                                                    <div style={{ gridColumn: 'span 2', background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' }}>
                                                        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#4f46e5', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <Cpu size={14} /> Local Ollama Model Manager
                                                        </div>
                                                        
                                                        {fetchingOllamaModels ? (
                                                            <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                                                                <Loader2 size={12} className="animate-spin" style={{ display: 'inline-block', marginRight: '6px' }} /> Checking local models...
                                                            </div>
                                                        ) : ollamaModels.length > 0 ? (
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}>Select from installed models</label>
                                                                <select 
                                                                    value={selectedProvider.modelName}
                                                                    onChange={e => {
                                                                        if (e.target.value) {
                                                                            setSelectedProvider({ ...selectedProvider, modelName: e.target.value });
                                                                        }
                                                                    }}
                                                                    style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem', outline: 'none' }}
                                                                >
                                                                    <option value="">-- Choose Installed Model --</option>
                                                                    {ollamaModels.map(m => (
                                                                        <option key={m.name} value={m.name}>{m.name} ({Math.round(m.size / 1e9 * 10) / 10} GB)</option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                        ) : (
                                                            <div style={{ fontSize: '0.78rem', color: '#64748b', fontStyle: 'italic' }}>
                                                                No local models detected. Make sure Ollama is running and your terminal started it with OLLAMA_ORIGINS="*" set.
                                                            </div>
                                                        )}

                                                        <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '4px 0' }} />

                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}>Pull / Download new model from Library</label>
                                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                                <input 
                                                                    type="text" 
                                                                    placeholder="e.g. deepseek-r1:8b, qwen2.5-coder:7b" 
                                                                    value={newOllamaModelName}
                                                                    onChange={e => setNewOllamaModelName(e.target.value)}
                                                                    style={{ flex: 1, padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.82rem', outline: 'none' }}
                                                                />
                                                                <button
                                                                    type="button"
                                                                    onClick={handlePullOllamaModel}
                                                                    disabled={pullingModel}
                                                                    style={{ padding: '8px 16px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                                                >
                                                                    {pullingModel ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                                                                    Pull Model
                                                                </button>
                                                            </div>
                                                            <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                                                                Find model names at <a href="https://ollama.com/library" target="_blank" rel="noreferrer" style={{ color: '#4f46e5', textDecoration: 'none' }}>ollama.com/library</a>.
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', gridColumn: 'span 2' }}>
                                                    <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Base URL</label>
                                                    <input 
                                                        type="text" 
                                                        value={selectedProvider.baseUrl}
                                                        onChange={e => setSelectedProvider({ ...selectedProvider, baseUrl: e.target.value })}
                                                        style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                                                    />
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                    <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Timeout (ms)</label>
                                                    <input 
                                                        type="number" 
                                                        value={selectedProvider.timeout}
                                                        onChange={e => setSelectedProvider({ ...selectedProvider, timeout: parseInt(e.target.value) || 5000 })}
                                                        style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                                                    />
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                    <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Retry Count</label>
                                                    <input 
                                                        type="number" 
                                                        value={selectedProvider.retryCount}
                                                        onChange={e => setSelectedProvider({ ...selectedProvider, retryCount: parseInt(e.target.value) || 1 })}
                                                        style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                                                    />
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                    <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Temperature</label>
                                                    <input 
                                                        type="number" 
                                                        step="0.05"
                                                        min="0"
                                                        max="1.5"
                                                        value={selectedProvider.temperature}
                                                        onChange={e => setSelectedProvider({ ...selectedProvider, temperature: parseFloat(e.target.value) || 0.1 })}
                                                        style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                                                    />
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                    <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Maximum Tokens</label>
                                                    <input 
                                                        type="number" 
                                                        value={selectedProvider.maxTokens}
                                                        onChange={e => setSelectedProvider({ ...selectedProvider, maxTokens: parseInt(e.target.value) || 2048 })}
                                                        style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                                                    />
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', gridColumn: 'span 2' }}>
                                                    <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Notes</label>
                                                    <input 
                                                        type="text" 
                                                        value={selectedProvider.notes || ''}
                                                        onChange={e => setSelectedProvider({ ...selectedProvider, notes: e.target.value })}
                                                        style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }}
                                                    />
                                                </div>
                                            </div>

                                            <div style={{ display: 'flex', gap: '12px', marginTop: '12px', justifyContent: 'flex-end' }}>
                                                <button
                                                    onClick={handleSaveProviderSettings}
                                                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 20px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}
                                                >
                                                    <Save size={16} /> Save provider profile
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.9rem' }}>
                                            Select a provider profile to edit configurations.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB: API KEYS */}
                    {activeTab === 'api_keys' && (
                        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '32px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                            <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', fontWeight: 700, color: '#1e293b' }}>Secure API Key Management</h3>
                            <p style={{ margin: '0 0 24px 0', color: '#64748b', fontSize: '0.82rem' }}>API keys are encrypted locally using AES-GCM before storage. They are never logged or exposed in system trace files.</p>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                {providers.map(p => {
                                    const hasKey = apiKeys[p.name] && apiKeys[p.name] !== '';
                                    return (
                                        <div key={p.name} style={{ display: 'flex', flexDirection: 'column', padding: '16px', border: '1px solid #f1f5f9', borderRadius: '10px', background: '#fcfcfd' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <Key size={16} className="text-indigo-600" />
                                                    <span style={{ fontWeight: 700, color: '#334155', fontSize: '0.9rem' }}>{p.name} API Key</span>
                                                    {!p.enabled && <span style={{ fontSize: '0.65rem', background: '#f1f5f9', color: '#94a3b8', padding: '2px 6px', borderRadius: '4px' }}>Disabled</span>}
                                                </div>
                                                <span style={{ fontSize: '0.75rem', color: hasKey ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                                                    {hasKey ? '● Saved & Encrypted' : '○ Key Missing'}
                                                </span>
                                            </div>

                                            <div style={{ display: 'flex', gap: '10px' }}>
                                                <div style={{ position: 'relative', flex: 1 }}>
                                                    <input
                                                        type={visibleKeys[p.name] ? "text" : "password"}
                                                        placeholder={`Enter API Key for ${p.name}`}
                                                        value={apiKeys[p.name] || ''}
                                                        onChange={e => setApiKeys({ ...apiKeys, [p.name]: e.target.value })}
                                                        style={{ width: '100%', padding: '10px 40px 10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem', outline: 'none' }}
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleKeyVisibility(p.name)}
                                                        style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}
                                                    >
                                                        {visibleKeys[p.name] ? <EyeOff size={16} /> : <Eye size={16} />}
                                                    </button>
                                                </div>
                                                <button
                                                    onClick={() => handleSaveApiKey(p.name)}
                                                    style={{ padding: '8px 16px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}
                                                >
                                                    Save Key
                                                </button>
                                                <button
                                                    onClick={() => handleTestProvider(p.name)}
                                                    disabled={testingProvider[p.name]}
                                                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: '#f8fafc', border: '1px solid #1a3c63', color: '#1a3c63', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700 }}
                                                >
                                                    {testingProvider[p.name] ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                                                    Test Connection
                                                </button>
                                                {hasKey && (
                                                    <button
                                                        onClick={() => handleDeleteApiKey(p.name)}
                                                        style={{ padding: '8px 12px', background: '#fef2f2', color: '#ef4444', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                )}
                                            </div>

                                            {/* Connection test result banner */}
                                            {testResults[p.name] && (
                                                <div style={{ 
                                                    marginTop: '12px', padding: '10px 12px', borderRadius: '6px', 
                                                    background: testResults[p.name].success ? '#f0fdf4' : '#fef2f2', 
                                                    border: testResults[p.name].success ? '1px solid #bbf7d0' : '1px solid #fecaca',
                                                    fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '8px'
                                                }}>
                                                    {testResults[p.name].success ? <CheckCircle2 size={16} className="text-green-600" /> : <XCircle size={16} className="text-red-600" />}
                                                    <div style={{ flex: 1 }}>
                                                        <strong>{testResults[p.name].success ? 'Connected' : 'Failed'}:</strong> {testResults[p.name].message}
                                                        {testResults[p.name].latency !== undefined && <span style={{ marginLeft: '12px', color: '#64748b', fontSize: '0.75rem' }}>Latency: {testResults[p.name].latency}ms</span>}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* TAB: DATABASE */}
                    {activeTab === 'database' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                            {/* Google Integration Block */}
                            <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '32px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', fontWeight: 700, color: '#1e293b' }}>Google Integration & Folder IDs</h3>
                                <p style={{ margin: '0 0 24px 0', color: '#64748b', fontSize: '0.82rem' }}>Configure company shared directories and calendars. Synchronization connects your workflows directly with GDrive storage.</p>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Google Drive Root Folder ID</label>
                                        <input
                                            type="text"
                                            name="google_drive_folder_id"
                                            placeholder="e.g. 1aBC...xyZ"
                                            value={settings.google_drive_folder_id || ''}
                                            onChange={handleChange}
                                            style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none' }}
                                        />
                                        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>ID of the `CELRON` root folder in your drive.</span>
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Google Calendar ID</label>
                                        <input
                                            type="text"
                                            name="google_calendar_id"
                                            placeholder="e.g. company@gmail.com"
                                            value={settings.google_calendar_id || ''}
                                            onChange={handleChange}
                                            style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none' }}
                                        />
                                        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Shared Google calendar address.</span>
                                    </div>

                                    <div style={{ gridColumn: '1 / -1', marginTop: '16px', padding: '24px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                            <div>
                                                <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <HardDrive size={18} className="text-indigo-600" /> Tiered Folder Architecture (01-99)
                                                </h4>
                                                <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>Provision consolidated layout structures automatically.</p>
                                            </div>
                                            <div style={{ display: 'flex', gap: '10px' }}>
                                                <button
                                                    onClick={handleVaultInit}
                                                    disabled={initializingVault || !settings.google_drive_folder_id}
                                                    style={{ padding: '10px 20px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', opacity: (initializingVault || !settings.google_drive_folder_id) ? 0.6 : 1 }}
                                                >
                                                    {initializingVault ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                                                    Sync Structures
                                                </button>
                                                <button
                                                    onClick={handleDriveMigration}
                                                    disabled={migratingDrive || !settings.google_drive_folder_id}
                                                    style={{ padding: '10px 20px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', opacity: (migratingDrive || !settings.google_drive_folder_id) ? 0.6 : 1 }}
                                                >
                                                    {migratingDrive ? <Loader2 size={16} className="animate-spin" /> : <HardDrive size={16} />}
                                                    Reorganize Drive
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Database Stats */}
                            <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '32px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                <h3 style={{ margin: '0 0 24px 0', fontSize: '1.1rem', fontWeight: 700, color: '#1e293b' }}>PostgreSQL Schema Status</h3>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                                    <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#4f46e5' }}>Active</div>
                                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>Supabase connection</div>
                                    </div>
                                    <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#10b981' }}>Enabled</div>
                                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>Multi-Tenant RLS</div>
                                    </div>
                                    <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f59e0b' }}>OK</div>
                                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>Database migration status</div>
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                <button disabled={saving} onClick={handleSave} style={{ background: '#4f46e5', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '8px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                    <Save size={18} /> {saving ? 'Saving...' : 'Save Database Settings'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* TAB: SECURITY */}
                    {activeTab === 'security' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                            <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '32px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                <h3 style={{ margin: '0 0 24px 0', fontSize: '1.1rem', fontWeight: 700, color: '#1e293b' }}>System Security Settings</h3>
                                
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                                    <div>
                                        <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1e293b', marginBottom: '4px' }}>Allow Public Signups</div>
                                        <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Show/Hide "Sign Up" registration links on public logins.</div>
                                    </div>
                                    <div onClick={() => setSettings(prev => ({ ...prev, allow_signup: !prev.allow_signup }))} style={{ cursor: 'pointer', color: settings.allow_signup ? '#10b981' : '#cbd5e1', transition: 'all 0.2s' }}>
                                        {settings.allow_signup ? <ToggleRight size={36} /> : <ToggleLeft size={36} />}
                                    </div>
                                </div>

                                <hr style={{ margin: '24px 0', border: 'none', borderTop: '1px solid #e2e8f0' }} />

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1e293b', marginBottom: '4px' }}>Security Audit Logs</div>
                                        <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Monitor access actions and security status events.</div>
                                    </div>
                                    <a 
                                        href="/admin/logs"
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', border: '1px solid #cbd5e1', borderRadius: '8px', textDecoration: 'none', color: '#475569', fontSize: '0.85rem', fontWeight: 600 }}
                                    >
                                        <ExternalLink size={14} /> Open Audit Logs
                                    </a>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB: MY LINKS */}
                    {activeTab === 'my_links' && (
                        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '32px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>My Quick Links</h3>
                                    <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>Manage your frequently visited websites and tools</p>
                                </div>
                                <button className="btn btn-primary" onClick={() => openToolModal()}>
                                    <Plus size={16} /> Add New Tool
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
                                            <tr><td colSpan="4" style={{ textAlign: 'center', padding: '30px', color: '#cbd5e1' }}>No tools added yet. Click "Add New Tool" to start pinning your favorite sites.</td></tr>
                                        ) : (
                                            tools.map(tool => (
                                                <tr key={tool.id}>
                                                    <td>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                            <div style={{ width: '32px', height: '32px', background: '#f1f5f9', borderRadius: '6px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                                {tool.logo_url ? <img src={tool.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <Globe size={16} color="#94a3b8" />}
                                                            </div>
                                                            <div style={{ fontWeight: 600 }}>{tool.name} {tool.is_pinned && <span style={{ color: '#ec4899' }}>★</span>}</div>
                                                        </div>
                                                    </td>
                                                    <td><span style={{ padding: '4px 10px', background: '#eff6ff', color: '#2563eb', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 600 }}>{tool.group_name || 'General'}</span></td>
                                                    <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        <a href={tool.url} target="_blank" rel="noreferrer" style={{ color: '#6366f1', textDecoration: 'none', fontSize: '0.85rem' }}>{tool.url}</a>
                                                    </td>
                                                    <td style={{ textAlign: 'right' }}>
                                                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                            <button onClick={() => openToolModal(tool)} style={{ border: 'none', background: 'none', color: '#6366f1', cursor: 'pointer' }}><Settings size={16} /></button>
                                                            <button onClick={() => handleDeleteTool(tool.id)} style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer' }}><Trash2 size={16} /></button>
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

                    {/* TAB: ABOUT */}
                    {activeTab === 'about' && (
                        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '32px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                            <h3 style={{ margin: '0 0 24px 0', fontSize: '1.1rem', fontWeight: 700, color: '#1e293b' }}>CelronHub AI Engine</h3>
                            
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '0.85rem', color: '#475569' }}>
                                <div><strong>System Version:</strong> v2.4.0-production</div>
                                <div><strong>Client Encryption Standard:</strong> AES-GCM 256-bit</div>
                                <div><strong>Centralized fallback priority loop:</strong> Enabled</div>
                                
                                <div style={{ marginTop: '24px', padding: '16px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                                    <Info size={18} className="text-amber-500" style={{ flexShrink: 0, marginTop: '2px' }} />
                                    <div>
                                        <h5 style={{ margin: '0 0 4px 0', fontWeight: 700, color: '#92400e' }}>Dynamic Failover Sequence Notice</h5>
                                        The application iterates through enabled providers according to their priority number if connection timeouts or API key rate limits occur. Ensure keys are test-verified before saving to prevent workflow slowdowns.
                                    </div>
                                </div>

                                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '24px', marginTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <h4 style={{ margin: 0, fontWeight: 700, color: '#334155' }}>Reset Configuration</h4>
                                        <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: '#64748b' }}>Restore factory defaults and remove all keys.</p>
                                    </div>
                                    <button
                                        onClick={handleResetAI}
                                        style={{ padding: '10px 20px', background: '#fee2e2', color: '#ef4444', border: '1px solid #fca5a5', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
                                    >
                                        Reset to defaults
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                </div>
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
