import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getEnquiries, getJobs, updateJob, updateEnquiry } from '../lib/workflowService';
import { getDocumentSettings } from '../lib/store';
import { 
    ExternalLink, Database, Search, Filter, ChevronDown, Folder, Briefcase, 
    FileText, Archive, Loader2, Plus, Upload, MoreVertical, Trash2, 
    Home, Shield, Zap, LayoutGrid, List, File, Image as ImageIcon, 
    FileVideo, FileAudio, FileCode, CheckCircle2, AlertCircle
} from 'lucide-react';
import { moveFolder, listFolderContent, uploadFileToDrive, getOrCreateFolder, deleteFile } from '../lib/driveService';
import { initializeVault } from '../lib/vaultService';

export default function StorageDirectory() {
    const { profile } = useAuth();
    const [enquiries, setEnquiries] = useState([]);
    const [jobs, setJobs] = useState([]);
    const [settings, setSettings] = useState(null);
    const [loading, setLoading] = useState(true);
    const [archivingId, setArchivingId] = useState(null);
    const [activeTab, setActiveTab] = useState('explorer');
    const [explorerFolderId, setExplorerFolderId] = useState(null);
    const [explorerItems, setExplorerItems] = useState([]);
    const [explorerLoading, setExplorerLoading] = useState(false);
    const [breadcrumbs, setBreadcrumbs] = useState([{ id: null, name: 'CELRON ROOT' }]);
    const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'
    const [searchQuery, setSearchQuery] = useState('');
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const fileInputRef = useRef(null);

    useEffect(() => {
        if (profile?.company_id) {
            fetchData();
        }
    }, [profile]);

    useEffect(() => {
        // Handle deep-linking via URL search params (e.g., ?tab=explorer&folder=vault)
        const params = new URLSearchParams(window.location.search);
        const tabParam = params.get('tab');
        const folderParam = params.get('folder');

        if (tabParam) setActiveTab(tabParam);
        
        if (activeTab === 'explorer') {
            const rootId = settings?.google_drive_folder_id;
            if (rootId && !explorerFolderId) {
                if (folderParam === 'vault' && settings.gdrive_04_id) {
                    navigateToFolder(settings.gdrive_04_id, '04. CORPORATE_VAULT');
                } else if (folderParam === 'scans' && settings.gdrive_99_id) {
                    navigateToFolder(settings.gdrive_99_id, '99. SCANS_INBOX');
                } else {
                    setExplorerFolderId(rootId);
                    setBreadcrumbs([{ id: rootId, name: 'CELRON ROOT' }]);
                    fetchExplorerItems(rootId);
                }
            }
        }
    }, [activeTab, settings]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [enqRes, jobsRes, settingsData] = await Promise.all([
                getEnquiries(profile.company_id),
                getJobs(profile.company_id),
                getDocumentSettings(profile.company_id)
            ]);
            if (enqRes.data) setEnquiries(enqRes.data);
            if (jobsRes.data) setJobs(jobsRes.data);
            if (settingsData) setSettings(settingsData);
        } catch (error) {
            console.error('Error fetching storage data:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchExplorerItems = async (folderId) => {
        setExplorerLoading(true);
        try {
            const accessToken = localStorage.getItem('google_access_token');
            if (!accessToken) throw new Error("Google not connected");
            const data = await listFolderContent(accessToken, folderId);
            setExplorerItems(data);
        } catch (err) {
            console.error("Explorer error:", err);
        } finally {
            setExplorerLoading(false);
        }
    };

    const navigateToFolder = (id, name) => {
        setActiveTab('explorer');
        setExplorerFolderId(id);
        setBreadcrumbs(prev => {
            const idx = prev.findIndex(b => b.id === id);
            if (idx !== -1) return prev.slice(0, idx + 1);
            return [...prev, { id, name }];
        });
        fetchExplorerItems(id);
    };

    const handleCreateFolder = async () => {
        const folderName = prompt("Enter new folder name:");
        if (!folderName) return;

        setExplorerLoading(true);
        try {
            const accessToken = localStorage.getItem('google_access_token');
            await getOrCreateFolder(accessToken, folderName, explorerFolderId);
            fetchExplorerItems(explorerFolderId);
        } catch (err) {
            alert("Failed to create folder: " + err.message);
        } finally {
            setExplorerLoading(false);
        }
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setUploading(true);
        setUploadProgress(0);
        try {
            const accessToken = localStorage.getItem('google_access_token');
            await uploadFileToDrive(accessToken, file, { 
                folderId: explorerFolderId,
                onProgress: (p) => setUploadProgress(p)
            });
            fetchExplorerItems(explorerFolderId);
        } catch (err) {
            alert("Upload failed: " + err.message);
        } finally {
            setUploading(false);
            setUploadProgress(0);
        }
    };

    const handleDeleteItem = async (id, name) => {
        if (!window.confirm(`Are you sure you want to delete "${name}"?`)) return;

        setExplorerLoading(true);
        try {
            const accessToken = localStorage.getItem('google_access_token');
            await deleteFile(accessToken, id);
            fetchExplorerItems(explorerFolderId);
        } catch (err) {
            alert("Delete failed: " + err.message);
        } finally {
            setExplorerLoading(false);
        }
    };

    const getFileIcon = (mimeType) => {
        if (mimeType === 'application/vnd.google-apps.folder') return <Folder size={24} color="#3b82f6" fill="#3b82f6" fillOpacity={0.1} />;
        if (mimeType.startsWith('image/')) return <ImageIcon size={24} color="#ec4899" />;
        if (mimeType.includes('pdf')) return <FileText size={24} color="#ef4444" />;
        if (mimeType.includes('video')) return <FileVideo size={24} color="#8b5cf6" />;
        if (mimeType.includes('audio')) return <FileAudio size={24} color="#f59e0b" />;
        if (mimeType.includes('code') || mimeType.includes('javascript') || mimeType.includes('html')) return <FileCode size={24} color="#10b981" />;
        return <File size={24} color="#94a3b8" />;
    };

    const filteredExplorerItems = explorerItems.filter(item => 
        item.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const items = activeTab === 'enquiries' ? enquiries : jobs;

    if (loading) return (
        <div style={{ background: '#f8fafc', minHeight: '100%', padding: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center' }}>
                <Loader2 className="animate-spin" size={40} color="#6366f1" />
                <p style={{ color: '#64748b', marginTop: '16px', fontWeight: 500 }}>Initializing Storage...</p>
            </div>
        </div>
    );

    return (
        <div style={{ background: '#f8fafc', minHeight: '100vh', padding: '24px', color: '#334155' }}>
            {/* Header Area */}
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#1e293b', margin: '0 0 4px 0', letterSpacing: '-0.02em' }}>Storage Hub</h1>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', fontSize: '0.9rem' }}>
                        <Database size={14} />
                        <span>Connected to Google Drive</span>
                        <div style={{ width: '4px', height: '4px', background: '#cbd5e1', borderRadius: '50%' }} />
                        <span>{activeTab === 'explorer' ? 'General Explorer' : activeTab === 'enquiries' ? 'Enquiries' : 'Orders/Jobs'}</span>
                    </div>
                </div>
                
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button 
                        onClick={() => fileInputRef.current?.click()}
                        style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '10px 16px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
                    >
                        <Upload size={18} color="#6366f1" /> Upload
                    </button>
                    <button 
                        onClick={handleCreateFolder}
                        style={{ background: '#6366f1', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer', boxShadow: '0 4px 12px rgba(99, 102, 241, 0.25)' }}
                    >
                        <Plus size={20} /> New Folder
                    </button>
                    <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileUpload} />
                </div>
            </header>

            {/* Navigation Tabs */}
            <div style={{ display: 'flex', gap: '24px', marginBottom: '24px', borderBottom: '1px solid #e2e8f0' }}>
                {['explorer', 'enquiries', 'jobs'].map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        style={{
                            padding: '12px 8px',
                            background: 'transparent',
                            border: 'none',
                            borderBottom: activeTab === tab ? '2px solid #6366f1' : '2px solid transparent',
                            color: activeTab === tab ? '#6366f1' : '#64748b',
                            fontWeight: activeTab === tab ? 700 : 500,
                            fontSize: '0.95rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            transition: 'all 0.2s'
                        }}
                    >
                        {tab === 'explorer' && <Database size={18} />}
                        {tab === 'enquiries' && <FileText size={18} />}
                        {tab === 'jobs' && <Briefcase size={18} />}
                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
                        {tab !== 'explorer' && (
                            <a 
                                href={tab === 'enquiries' ? 'https://drive.google.com/drive/folders/1Hr9-SFbjS-1pPIYu1kY57cRdc-1PVRij?usp=drive_link' : 'https://drive.google.com/drive/folders/1GPr3g5mq6_TotBzM8gDz_atJPR7TgbB-?usp=drive_link'}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                style={{ 
                                    marginLeft: '6px', 
                                    display: 'inline-flex', 
                                    alignItems: 'center', 
                                    color: activeTab === tab ? '#6366f1' : '#94a3b8',
                                    transition: 'color 0.2s'
                                }}
                                title={`Open Google Drive ${tab.charAt(0).toUpperCase() + tab.slice(1)} folder`}
                                onMouseEnter={e => e.currentTarget.style.color = '#4f46e5'}
                                onMouseLeave={e => e.currentTarget.style.color = activeTab === tab ? '#6366f1' : '#94a3b8'}
                            >
                                <ExternalLink size={14} />
                            </a>
                        )}
                    </button>
                ))}
            </div>

            {/* Main Content Area */}
            <div style={{ display: 'flex', gap: '24px', height: 'calc(100vh - 220px)' }}>
                {/* Explorer Sidebar (Quick Access) */}
                <div style={{ width: '260px', background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px', display: 'flex', flexDirection: 'column', gap: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <div>
                        <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>Quick Access</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <button onClick={() => navigateToFolder(settings?.google_drive_folder_id, 'CELRON ROOT')} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderRadius: '10px', border: 'none', background: explorerFolderId === settings?.google_drive_folder_id ? '#f1f5ff' : 'transparent', color: explorerFolderId === settings?.google_drive_folder_id ? '#6366f1' : '#475569', fontWeight: 600, cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                                <Home size={18} /> Root Directory
                            </button>
                            <button onClick={() => settings?.gdrive_04_id && navigateToFolder(settings.gdrive_04_id, '04. CORPORATE_VAULT')} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderRadius: '10px', border: 'none', background: explorerFolderId === settings?.gdrive_04_id ? '#f1f5ff' : 'transparent', color: explorerFolderId === settings?.gdrive_04_id ? '#6366f1' : '#475569', fontWeight: 600, cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                                <Shield size={18} /> Corporate Vault
                            </button>
                            <button onClick={() => settings?.gdrive_99_id && navigateToFolder(settings.gdrive_99_id, '99. SCANS_INBOX')} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderRadius: '10px', border: 'none', background: explorerFolderId === settings?.gdrive_99_id ? '#f1f5ff' : 'transparent', color: explorerFolderId === settings?.gdrive_99_id ? '#6366f1' : '#475569', fontWeight: 600, cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                                <Zap size={18} /> Scans Inbox
                            </button>
                        </div>
                    </div>

                    <div>
                        <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>Project Folders</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <button onClick={() => navigateToFolder('1Hr9-SFbjS-1pPIYu1kY57cRdc-1PVRij', 'Enquiries')} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderRadius: '10px', border: 'none', background: explorerFolderId === '1Hr9-SFbjS-1pPIYu1kY57cRdc-1PVRij' ? '#f1f5ff' : 'transparent', color: explorerFolderId === '1Hr9-SFbjS-1pPIYu1kY57cRdc-1PVRij' ? '#6366f1' : '#475569', fontWeight: 600, cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                                <FileText size={18} /> Enquiries
                            </button>
                            <button onClick={() => navigateToFolder('1GPr3g5mq6_TotBzM8gDz_atJPR7TgbB-', 'Jobs')} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderRadius: '10px', border: 'none', background: explorerFolderId === '1GPr3g5mq6_TotBzM8gDz_atJPR7TgbB-' ? '#f1f5ff' : 'transparent', color: explorerFolderId === '1GPr3g5mq6_TotBzM8gDz_atJPR7TgbB-' ? '#6366f1' : '#475569', fontWeight: 600, cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                                <Briefcase size={18} /> Jobs
                            </button>
                            <button onClick={() => settings?.gdrive_current_jobs_id && navigateToFolder(settings.gdrive_current_jobs_id, 'Active Jobs')} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderRadius: '10px', border: 'none', background: explorerFolderId === settings?.gdrive_current_jobs_id ? '#f1f5ff' : 'transparent', color: explorerFolderId === settings?.gdrive_current_jobs_id ? '#6366f1' : '#475569', fontWeight: 600, cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                                <Briefcase size={18} /> Active Jobs
                            </button>
                            <button onClick={() => settings?.gdrive_02_id && navigateToFolder(settings.gdrive_02_id, 'Permanent Records')} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderRadius: '10px', border: 'none', background: explorerFolderId === settings?.gdrive_02_id ? '#f1f5ff' : 'transparent', color: explorerFolderId === settings?.gdrive_02_id ? '#6366f1' : '#475569', fontWeight: 600, cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                                <Archive size={18} /> Permanent
                            </button>
                        </div>
                    </div>

                    {uploading && (
                        <div style={{ marginTop: 'auto', background: '#f8fafc', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>Uploading...</span>
                                <span style={{ fontSize: '0.75rem', color: '#6366f1', fontWeight: 700 }}>{uploadProgress}%</span>
                            </div>
                            <div style={{ height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                                <div style={{ height: '100%', background: '#6366f1', width: `${uploadProgress}%`, transition: 'width 0.3s' }} />
                            </div>
                        </div>
                    )}
                </div>

                {/* Explorer Main Content */}
                <div style={{ flex: 1, background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    {/* Explorer Toolbar */}
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                            {breadcrumbs.map((b, i) => (
                                <React.Fragment key={b.id}>
                                    <button 
                                        onClick={() => navigateToFolder(b.id, b.name)}
                                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: i === breadcrumbs.length - 1 ? '#1e293b' : '#6366f1', fontWeight: i === breadcrumbs.length - 1 ? 700 : 500, fontSize: '0.9rem' }}
                                    >
                                        {b.name}
                                    </button>
                                    {i < breadcrumbs.length - 1 && <ChevronDown size={14} color="#94a3b8" style={{ transform: 'rotate(-90deg)' }} />}
                                </React.Fragment>
                            ))}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '6px 12px', width: '240px' }}>
                                <Search size={16} color="#94a3b8" />
                                <input 
                                    type="text" 
                                    placeholder="Search this folder..." 
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    style={{ border: 'none', background: 'transparent', outline: 'none', padding: '0 8px', fontSize: '0.85rem', width: '100%' }} 
                                />
                            </div>
                            <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: '8px', padding: '2px' }}>
                                <button onClick={() => setViewMode('grid')} style={{ padding: '6px', border: 'none', background: viewMode === 'grid' ? '#fff' : 'transparent', borderRadius: '6px', cursor: 'pointer', boxShadow: viewMode === 'grid' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none' }}>
                                    <LayoutGrid size={16} color={viewMode === 'grid' ? '#6366f1' : '#64748b'} />
                                </button>
                                <button onClick={() => setViewMode('list')} style={{ padding: '6px', border: 'none', background: viewMode === 'list' ? '#fff' : 'transparent', borderRadius: '6px', cursor: 'pointer', boxShadow: viewMode === 'list' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none' }}>
                                    <List size={16} color={viewMode === 'list' ? '#6366f1' : '#64748b'} />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Explorer File View */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
                        {explorerLoading ? (
                            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Loader2 className="animate-spin" size={32} color="#6366f1" />
                            </div>
                        ) : activeTab === 'explorer' ? (
                            <>
                                {viewMode === 'grid' ? (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '20px' }}>
                                        {filteredExplorerItems.map(item => (
                                            <div 
                                                key={item.id}
                                                onClick={() => item.mimeType === 'application/vnd.google-apps.folder' ? navigateToFolder(item.id, item.name) : window.open(item.webViewLink, '_blank')}
                                                style={{ 
                                                    padding: '20px', 
                                                    border: '1px solid #e2e8f0', 
                                                    borderRadius: '16px', 
                                                    cursor: 'pointer',
                                                    display: 'flex', 
                                                    flexDirection: 'column', 
                                                    alignItems: 'center', 
                                                    textAlign: 'center',
                                                    gap: '12px',
                                                    transition: 'all 0.2s',
                                                    position: 'relative',
                                                    group: 'true'
                                                }}
                                                onMouseEnter={e => {
                                                    e.currentTarget.style.borderColor = '#6366f1';
                                                    e.currentTarget.style.background = '#fcfdff';
                                                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.05)';
                                                }}
                                                onMouseLeave={e => {
                                                    e.currentTarget.style.borderColor = '#e2e8f0';
                                                    e.currentTarget.style.background = 'transparent';
                                                    e.currentTarget.style.boxShadow = 'none';
                                                }}
                                            >
                                                {getFileIcon(item.mimeType)}
                                                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1e293b', width: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {item.name}
                                                </span>
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); handleDeleteItem(item.id, item.name); }}
                                                    style={{ position: 'absolute', top: '8px', right: '8px', padding: '4px', border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8', opacity: 0.6 }}
                                                    onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                                                    onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                                                <th style={{ textAlign: 'left', padding: '12px', color: '#64748b', fontSize: '0.8rem', fontWeight: 600 }}>Name</th>
                                                <th style={{ textAlign: 'left', padding: '12px', color: '#64748b', fontSize: '0.8rem', fontWeight: 600 }}>Date Modified</th>
                                                <th style={{ textAlign: 'left', padding: '12px', color: '#64748b', fontSize: '0.8rem', fontWeight: 600 }}>Size</th>
                                                <th style={{ textAlign: 'right', padding: '12px', color: '#64748b', fontSize: '0.8rem', fontWeight: 600 }}>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredExplorerItems.map(item => (
                                                <tr 
                                                    key={item.id} 
                                                    onClick={() => item.mimeType === 'application/vnd.google-apps.folder' ? navigateToFolder(item.id, item.name) : window.open(item.webViewLink, '_blank')}
                                                    style={{ borderBottom: '1px solid #f8fafc', cursor: 'pointer' }}
                                                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                                >
                                                    <td style={{ padding: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                        {getFileIcon(item.mimeType)}
                                                        <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{item.name}</span>
                                                    </td>
                                                    <td style={{ padding: '12px', fontSize: '0.85rem', color: '#64748b' }}>
                                                        {new Date(item.createdTime).toLocaleDateString()}
                                                    </td>
                                                    <td style={{ padding: '12px', fontSize: '0.85rem', color: '#64748b' }}>
                                                        {item.size ? `${(parseInt(item.size) / 1024).toFixed(1)} KB` : '--'}
                                                    </td>
                                                    <td style={{ padding: '12px', textAlign: 'right' }}>
                                                        <button onClick={(e) => { e.stopPropagation(); handleDeleteItem(item.id, item.name); }} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8' }}>
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                                {filteredExplorerItems.length === 0 && (
                                    <div style={{ height: '300px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', gap: '12px' }}>
                                        <Folder size={48} opacity={0.3} />
                                        <p>No files or folders found</p>
                                    </div>
                                )}
                            </>
                        ) : (
                            /* Enquiries/Jobs Table (Original View) */
                            <div style={{ background: '#fff', borderRadius: '16px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                                {/* Google Drive Root Folder Links Banner */}
                                <div style={{ 
                                    padding: '16px 20px', 
                                    background: '#f8fafc', 
                                    borderBottom: '1px solid #e2e8f0', 
                                    display: 'flex', 
                                    justifyContent: 'space-between', 
                                    alignItems: 'center'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Folder size={18} color="#6366f1" />
                                        <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#334155' }}>
                                            Google Drive Root Folder for {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '12px' }}>
                                        <a 
                                            href={activeTab === 'enquiries' ? 'https://drive.google.com/drive/folders/1Hr9-SFbjS-1pPIYu1kY57cRdc-1PVRij?usp=drive_link' : 'https://drive.google.com/drive/folders/1GPr3g5mq6_TotBzM8gDz_atJPR7TgbB-?usp=drive_link'}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{ 
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                gap: '6px', 
                                                background: '#fff', 
                                                border: '1px solid #cbd5e1', 
                                                padding: '6px 12px', 
                                                borderRadius: '8px', 
                                                fontSize: '0.8rem', 
                                                fontWeight: 600, 
                                                color: '#334155',
                                                textDecoration: 'none',
                                                cursor: 'pointer',
                                                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                                                transition: 'all 0.2s'
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.borderColor = '#6366f1'}
                                            onMouseLeave={e => e.currentTarget.style.borderColor = '#cbd5e1'}
                                        >
                                            <ExternalLink size={14} /> Open in Google Drive
                                        </a>
                                        <button 
                                            onClick={() => {
                                                const folderId = activeTab === 'enquiries' ? '1Hr9-SFbjS-1pPIYu1kY57cRdc-1PVRij' : '1GPr3g5mq6_TotBzM8gDz_atJPR7TgbB-';
                                                navigateToFolder(folderId, activeTab.charAt(0).toUpperCase() + activeTab.slice(1));
                                            }}
                                            style={{ 
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                gap: '6px', 
                                                background: '#6366f1', 
                                                border: 'none', 
                                                padding: '6px 12px', 
                                                borderRadius: '8px', 
                                                fontSize: '0.8rem', 
                                                fontWeight: 600, 
                                                color: '#fff',
                                                cursor: 'pointer',
                                                boxShadow: '0 4px 12px rgba(99, 102, 241, 0.2)'
                                            }}
                                        >
                                            <Database size={14} /> Browse in Storage Hub
                                        </button>
                                    </div>
                                </div>
                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                                            <th style={{ padding: '16px', color: '#64748b', fontWeight: 600, fontSize: '0.85rem' }}>Reference</th>
                                            <th style={{ padding: '16px', color: '#64748b', fontWeight: 600, fontSize: '0.85rem' }}>Partner</th>
                                            <th style={{ padding: '16px', color: '#64748b', fontWeight: 600, fontSize: '0.85rem' }}>Status</th>
                                            <th style={{ padding: '16px', color: '#64748b', fontWeight: 600, fontSize: '0.85rem', textAlign: 'right' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {items.map((item) => (
                                            <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                <td style={{ padding: '16px', fontWeight: 700, color: '#1e293b' }}>
                                                    {activeTab === 'enquiries' ? item.enquiry_no : item.job_no}
                                                </td>
                                                <td style={{ padding: '16px', color: '#475569' }}>
                                                    {activeTab === 'enquiries' ? item.partners?.name : item.enquiries?.partners?.name || 'Customer'}
                                                </td>
                                                <td style={{ padding: '16px' }}>
                                                    <span style={{ background: item.google_drive_link ? '#dcfce7' : '#f1f5f9', color: item.google_drive_link ? '#166534' : '#64748b', padding: '4px 12px', borderRadius: '16px', fontSize: '0.75rem', fontWeight: 700 }}>
                                                        {item.google_drive_link ? 'FOLDER LINKED' : 'NO FOLDER'}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '16px', textAlign: 'right' }}>
                                                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                        <button 
                                                            onClick={() => item.google_drive_link && window.open(item.google_drive_link, '_blank')}
                                                            disabled={!item.google_drive_link}
                                                            style={{ border: '1px solid #e2e8f0', background: item.google_drive_link ? '#fff' : '#f8fafc', padding: '6px 12px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600, cursor: item.google_drive_link ? 'pointer' : 'not-allowed', color: item.google_drive_link ? '#475569' : '#94a3b8' }}
                                                        >
                                                            Open Drive
                                                        </button>
                                                        <button 
                                                            onClick={async () => {
                                                                const folderId = item.gdrive_folder_id || (item.google_drive_link?.match(/\/folders\/([a-zA-Z0-9_-]+)/)?.[1]);
                                                                if (folderId) navigateToFolder(folderId, activeTab === 'enquiries' ? item.enquiry_no : item.job_no);
                                                                setActiveTab('explorer');
                                                            }}
                                                            disabled={!item.google_drive_link}
                                                            style={{ background: item.google_drive_link ? '#6366f1' : '#cbd5e1', border: 'none', color: '#fff', padding: '6px 12px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600, cursor: item.google_drive_link ? 'pointer' : 'not-allowed' }}
                                                        >
                                                            Quick Explorer
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
