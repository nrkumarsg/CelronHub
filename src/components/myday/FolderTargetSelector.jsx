import React, { useState, useEffect, useCallback } from 'react';
import { 
    Folder, FolderOpen, Plus, Search, ChevronRight, X, Loader2, 
    BookOpen, Award, Ruler, Inbox, Database, RefreshCw,
    Image, FileText, CreditCard, FileCheck, Layers, Briefcase
} from 'lucide-react';
import { listFolderContent, getOrCreateFolder } from '../../lib/driveService';
import { getStoredToken } from '../../lib/googleAuthService';

// ─── Global Preset root folder configurations ──────────────────────────────────
const GLOBAL_ROOT_PRESETS = [
    { id: 'manuals',      label: 'Manuals',      icon: BookOpen,  color: '#6366f1', settingKey: 'gdrive_manuals_id' },
    { id: 'certificates', label: 'Certificates', icon: Award,     color: '#f59e0b', settingKey: 'gdrive_certs_id' },
    { id: 'drawings',     label: 'Drawings',     icon: Ruler,     color: '#06b6d4', settingKey: 'gdrive_drawings_id' },
    { id: 'scans',        label: 'Scans Inbox',  icon: Inbox,     color: '#10b981', settingKey: 'gdrive_99_id' },
    { id: 'general',      label: 'General Docs', icon: Database,  color: '#8b5cf6', settingKey: 'gdrive_docs_id' },
];

// ─── Standard Job Folder Presets ──────────────────────────────────────────────
const STANDARD_JOB_PRESETS = [
    { id: 'photos',    name: 'Photos & Gallery',       label: 'Photos & Gallery',       icon: Image,      color: '#10b981', desc: 'Photos, media, site pictures & drawings' },
    { id: 'worksuite', name: 'Worksuite',              label: 'Worksuite',              icon: FileText,   color: '#6366f1', desc: 'Quotations, invoices & delivery orders' },
    { id: 'supplier',  name: 'SupplierBills&Expenses', label: 'SupplierBills&Expenses', icon: CreditCard, color: '#f59e0b', desc: 'Vendor bills, POs & receipts' },
    { id: 'support',   name: 'SupportDocs',            label: 'SupportDocs',            icon: FileCheck,  color: '#059669', desc: 'Signed PODs, test certs & reports' },
];

const RECENT_TARGETS_KEY = 'celron_recent_upload_targets';

function getRecentTargets() {
    try { return JSON.parse(localStorage.getItem(RECENT_TARGETS_KEY) || '[]'); }
    catch { return []; }
}

function saveRecentTarget(target) {
    try {
        const existing = getRecentTargets().filter(t => t.folderId !== target.folderId);
        const updated = [target, ...existing].slice(0, 3);
        localStorage.setItem(RECENT_TARGETS_KEY, JSON.stringify(updated));
    } catch {}
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function FolderTargetSelector({ 
    settings, 
    jobFolderId, 
    jobNo, 
    activeFolderName, 
    onSelect, 
    onCancel 
}) {
    const isJobContext = Boolean(jobNo || jobFolderId);
    const [viewMode, setViewMode] = useState(isJobContext ? 'job' : 'global');
    
    // Job-mode state
    const [jobPresets] = useState(STANDARD_JOB_PRESETS);
    const [selectedJobPreset, setSelectedJobPreset] = useState(STANDARD_JOB_PRESETS[0]);
    const [jobSubfolders, setJobSubfolders] = useState([]);
    const [loadingJobFolders, setLoadingJobFolders] = useState(false);

    // Global-mode state
    const [selectedRoot, setSelectedRoot] = useState(null);
    const [subfolders, setSubfolders] = useState([]);
    const [subSearch, setSubSearch] = useState('');
    const [loadingSubfolders, setLoadingSubfolders] = useState(false);
    const [selectedSubfolder, setSelectedSubfolder] = useState(null);

    // Folder creation
    const [creatingFolder, setCreatingFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [showNewFolder, setShowNewFolder] = useState(false);
    const [recentTargets] = useState(getRecentTargets());

    // Load Job Subfolders on mount
    const loadJobFolders = useCallback(async () => {
        if (!jobFolderId) return;
        const token = getStoredToken();
        if (!token) return;
        setLoadingJobFolders(true);
        try {
            const items = await listFolderContent(token, jobFolderId);
            const folders = (items || []).filter(i => i.mimeType === 'application/vnd.google-apps.folder');
            setJobSubfolders(folders);
        } catch (err) {
            console.error('FolderTargetSelector: error loading job folders', err);
        } finally {
            setLoadingJobFolders(false);
        }
    }, [jobFolderId]);

    useEffect(() => {
        if (isJobContext) {
            loadJobFolders();
        }
    }, [isJobContext, loadJobFolders]);

    const getRootFolderId = useCallback((preset) => {
        if (!settings) return null;
        return settings[preset.settingKey] || settings.google_drive_folder_id || null;
    }, [settings]);

    const loadSubfolders = useCallback(async (preset) => {
        const token = getStoredToken();
        const rootId = getRootFolderId(preset);
        if (!token || !rootId) {
            setSubfolders([]);
            return;
        }
        setLoadingSubfolders(true);
        try {
            const items = await listFolderContent(token, rootId);
            const folders = (items || []).filter(i => i.mimeType === 'application/vnd.google-apps.folder');
            setSubfolders(folders);
        } catch (err) {
            console.error('FolderTargetSelector: error loading subfolders', err);
            setSubfolders([]);
        } finally {
            setLoadingSubfolders(false);
        }
    }, [getRootFolderId]);

    const handleSelectRoot = (preset) => {
        setSelectedRoot(preset);
        setSelectedSubfolder(null);
        setSubSearch('');
        setShowNewFolder(false);
        loadSubfolders(preset);
    };

    const handleSelectJobPreset = async (preset) => {
        setSelectedJobPreset(preset);
        setSelectedSubfolder(null);
        setShowNewFolder(false);
    };

    const handleCreateJobSubfolder = async () => {
        if (!newFolderName.trim() || !jobFolderId) return;
        const token = getStoredToken();
        if (!token) return;
        setCreatingFolder(true);
        try {
            const folderId = await getOrCreateFolder(token, newFolderName.trim(), jobFolderId);
            const newFolder = { id: folderId, name: newFolderName.trim() };
            setJobSubfolders(prev => [newFolder, ...prev]);
            setSelectedSubfolder(newFolder);
            setShowNewFolder(false);
            setNewFolderName('');
        } catch (err) {
            console.error('FolderTargetSelector: error creating job folder', err);
        } finally {
            setCreatingFolder(false);
        }
    };

    const handleCreateGlobalFolder = async () => {
        if (!newFolderName.trim() || !selectedRoot) return;
        const token = getStoredToken();
        const rootId = getRootFolderId(selectedRoot);
        if (!token || !rootId) return;
        setCreatingFolder(true);
        try {
            const folderId = await getOrCreateFolder(token, newFolderName.trim(), rootId);
            const newFolder = { id: folderId, name: newFolderName.trim() };
            setSubfolders(prev => [newFolder, ...prev]);
            setSelectedSubfolder(newFolder);
            setShowNewFolder(false);
            setNewFolderName('');
        } catch (err) {
            console.error('FolderTargetSelector: error creating folder', err);
        } finally {
            setCreatingFolder(false);
        }
    };

    const handleConfirmJobTarget = async () => {
        const token = getStoredToken();
        const targetName = selectedSubfolder ? selectedSubfolder.name : selectedJobPreset.name;
        let targetId = selectedSubfolder ? selectedSubfolder.id : null;

        // If targetId is not known, resolve/create the preset subfolder in Google Drive
        if (!targetId && jobFolderId && token) {
            try {
                targetId = await getOrCreateFolder(token, selectedJobPreset.name, jobFolderId);
            } catch (e) {
                console.warn('Failed to get/create job subfolder:', e);
                targetId = jobFolderId;
            }
        }

        const target = {
            id: targetId || jobFolderId,
            folderId: targetId || jobFolderId,
            path: `${jobNo || 'Job'} > ${targetName}`,
            label: targetName,
            name: targetName
        };
        saveRecentTarget(target);
        onSelect(target);
    };

    const handleConfirmGlobal = () => {
        const rootId = getRootFolderId(selectedRoot);
        const target = selectedSubfolder
            ? { id: selectedSubfolder.id, folderId: selectedSubfolder.id, path: `${selectedRoot.label} / ${selectedSubfolder.name}`, label: selectedSubfolder.name, name: selectedSubfolder.name }
            : { id: rootId, folderId: rootId, path: selectedRoot.label, label: selectedRoot.label, name: selectedRoot.label };
        saveRecentTarget(target);
        onSelect(target);
    };

    const filteredSubfolders = subfolders.filter(f =>
        f.name.toLowerCase().includes(subSearch.toLowerCase())
    );

    return (
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', boxShadow: '0 8px 32px rgba(0,0,0,0.1)', overflow: 'hidden', width: '100%' }}>
            {/* Header */}
            <div style={{ background: 'linear-gradient(135deg, #1e3a8a, #3b82f6)', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Folder size={18} color="#fff" />
                    <div>
                        <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>
                            {isJobContext ? `Select Destination Folder for Job ${jobNo || ''}` : 'Select Destination Folder'}
                        </div>
                        {isJobContext && (
                            <div style={{ color: '#bfdbfe', fontSize: 11 }}>
                                Files save automatically inside this Job's dedicated Google Drive folder structure
                            </div>
                        )}
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {isJobContext && (
                        <button
                            type="button"
                            onClick={() => setViewMode(viewMode === 'job' ? 'global' : 'job')}
                            style={{
                                background: 'rgba(255,255,255,0.15)',
                                border: '1px solid rgba(255,255,255,0.3)',
                                borderRadius: 6,
                                padding: '4px 10px',
                                color: '#fff',
                                fontSize: 11,
                                fontWeight: 600,
                                cursor: 'pointer'
                            }}
                        >
                            {viewMode === 'job' ? '🌐 Global Catalogs' : '📁 Job Folders'}
                        </button>
                    )}
                    {onCancel && (
                        <button onClick={onCancel} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center' }}>
                            <X size={14} />
                        </button>
                    )}
                </div>
            </div>

            <div style={{ padding: 16 }}>
                {/* Mode 1: Job Folders View (Default when in a Job) */}
                {viewMode === 'job' ? (
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <p style={{ margin: 0, fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Job Folders ({jobNo || 'Active Job'})
                            </p>
                            <span style={{ fontSize: 11, color: '#10b981', fontWeight: 600 }}>
                                Standard 4-Tier Hierarchy
                            </span>
                        </div>

                        {/* Standard Job Folder Tiles */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginBottom: 14 }}>
                            {jobPresets.map(preset => {
                                const Icon = preset.icon;
                                const isSelected = selectedJobPreset?.id === preset.id && !selectedSubfolder;
                                return (
                                    <button 
                                        key={preset.id} 
                                        type="button"
                                        onClick={() => handleSelectJobPreset(preset)}
                                        style={{ 
                                            padding: '12px 14px', 
                                            borderRadius: 10, 
                                            border: `2px solid ${isSelected ? preset.color : '#e2e8f0'}`, 
                                            background: isSelected ? `${preset.color}15` : '#f8fafc', 
                                            cursor: 'pointer', 
                                            textAlign: 'left', 
                                            transition: 'all 0.15s',
                                            display: 'flex',
                                            alignItems: 'flex-start',
                                            gap: 10
                                        }}
                                    >
                                        <div style={{ width: 32, height: 32, borderRadius: 8, background: isSelected ? preset.color : '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <Icon size={16} color={isSelected ? '#fff' : '#64748b'} />
                                        </div>
                                        <div>
                                            <span style={{ fontSize: 13, fontWeight: 700, color: isSelected ? preset.color : '#1e293b', display: 'block' }}>
                                                {preset.label}
                                            </span>
                                            <span style={{ fontSize: 11, color: '#64748b', display: 'block', marginTop: 2 }}>
                                                {preset.desc}
                                            </span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Custom subfolders inside this Job (if any) */}
                        {jobSubfolders.length > 0 && (
                            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 12, marginBottom: 12 }}>
                                <p style={{ fontSize: 11, color: '#64748b', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase' }}>
                                    Additional Subfolders in {jobNo || 'Job'}
                                </p>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                    {jobSubfolders.map(folder => (
                                        <button
                                            key={folder.id}
                                            type="button"
                                            onClick={() => {
                                                setSelectedSubfolder(folder);
                                                setSelectedJobPreset(null);
                                            }}
                                            style={{
                                                background: selectedSubfolder?.id === folder.id ? '#1e3a8a' : '#f1f5f9',
                                                border: `1px solid ${selectedSubfolder?.id === folder.id ? '#1e3a8a' : '#cbd5e1'}`,
                                                borderRadius: 6,
                                                padding: '5px 12px',
                                                fontSize: 12,
                                                fontWeight: 600,
                                                color: selectedSubfolder?.id === folder.id ? '#fff' : '#334155',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 6
                                            }}
                                        >
                                            <Folder size={12} color={selectedSubfolder?.id === folder.id ? '#fff' : '#64748b'} />
                                            {folder.name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Create custom subfolder inside Job */}
                        <div style={{ marginTop: 8 }}>
                            {!showNewFolder ? (
                                <button 
                                    type="button"
                                    onClick={() => setShowNewFolder(true)}
                                    style={{ width: '100%', padding: '8px', borderRadius: 8, border: '1px dashed #cbd5e1', background: '#fafafa', cursor: 'pointer', color: '#1e3a8a', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                                >
                                    <Plus size={13} /> Create Custom Subfolder inside {jobNo || 'this Job'}
                                </button>
                            ) : (
                                <div style={{ display: 'flex', gap: 6 }}>
                                    <input 
                                        value={newFolderName} 
                                        onChange={e => setNewFolderName(e.target.value)}
                                        placeholder="e.g. Ultrasonic Test Reports..." 
                                        autoFocus
                                        onKeyDown={e => { if (e.key === 'Enter') handleCreateJobSubfolder(); if (e.key === 'Escape') setShowNewFolder(false); }}
                                        style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: '1px solid #1e3a8a', fontSize: 13, outline: 'none' }} 
                                    />
                                    <button 
                                        type="button"
                                        onClick={handleCreateJobSubfolder} 
                                        disabled={creatingFolder || !newFolderName.trim()}
                                        style={{ padding: '7px 12px', borderRadius: 8, background: '#1e3a8a', border: 'none', color: '#fff', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
                                    >
                                        {creatingFolder ? <Loader2 size={12} className="spin" /> : <Plus size={12} />} Create
                                    </button>
                                    <button type="button" onClick={() => setShowNewFolder(false)} style={{ padding: '7px 10px', borderRadius: 8, background: '#f1f5f9', border: 'none', cursor: 'pointer' }}>
                                        <X size={14} color="#64748b" />
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Selected Target Preview & Confirm */}
                        <div style={{ marginTop: 14, padding: '12px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                                <Folder size={16} color="#10b981" />
                                <div>
                                    <div style={{ fontSize: 11, color: '#065f46', fontWeight: 600 }}>Selected Destination:</div>
                                    <div style={{ fontSize: 13, color: '#047857', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {jobNo || 'Job'} &gt; {selectedSubfolder ? selectedSubfolder.name : selectedJobPreset?.name || 'Photos & Gallery'}
                                    </div>
                                </div>
                            </div>
                            <button 
                                type="button"
                                onClick={handleConfirmJobTarget}
                                style={{ padding: '8px 18px', borderRadius: 8, background: '#10b981', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
                            >
                                ✓ Confirm Destination
                            </button>
                        </div>
                    </div>
                ) : (
                    /* Mode 2: Global Root Catalogs (Manuals, Certificates, Drawings, etc.) */
                    <div>
                        {/* Recent Targets */}
                        {recentTargets.length > 0 && (
                            <div style={{ marginBottom: 14 }}>
                                <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recent</p>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                    {recentTargets.map((t, i) => (
                                        <button key={i} onClick={() => onSelect(t)}
                                            style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 20, padding: '4px 12px', fontSize: 12, color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                                            <Folder size={11} /> {t.path}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Root Folder Tiles */}
                        <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Global Catalog Folders</p>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
                            {GLOBAL_ROOT_PRESETS.map(preset => {
                                const Icon = preset.icon;
                                const isSelected = selectedRoot?.id === preset.id;
                                return (
                                    <button key={preset.id} onClick={() => handleSelectRoot(preset)}
                                        style={{ padding: '10px 8px', borderRadius: 10, border: `2px solid ${isSelected ? preset.color : '#e2e8f0'}`, background: isSelected ? `${preset.color}15` : '#f8fafc', cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s' }}>
                                        <Icon size={18} color={isSelected ? preset.color : '#94a3b8'} style={{ margin: '0 auto 4px' }} />
                                        <span style={{ fontSize: 11, fontWeight: 600, color: isSelected ? preset.color : '#64748b', display: 'block' }}>{preset.label}</span>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Subfolder Selector */}
                        {selectedRoot && (
                            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 14 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                    <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Subfolder</p>
                                    <button onClick={() => loadSubfolders(selectedRoot)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                                        <RefreshCw size={12} /> Refresh
                                    </button>
                                </div>

                                {/* Search */}
                                <div style={{ position: 'relative', marginBottom: 8 }}>
                                    <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                    <input value={subSearch} onChange={e => setSubSearch(e.target.value)}
                                        placeholder="Search subfolders..." style={{ width: '100%', padding: '7px 10px 7px 30px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none', background: '#f8fafc', boxSizing: 'border-box' }} />
                                </div>

                                {/* Subfolder List */}
                                <div style={{ maxHeight: 160, overflowY: 'auto', borderRadius: 8, border: '1px solid #f1f5f9' }}>
                                    {loadingSubfolders ? (
                                        <div style={{ padding: 16, textAlign: 'center', color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                                            <Loader2 size={14} className="spin" /> Loading...
                                        </div>
                                    ) : filteredSubfolders.length === 0 ? (
                                        <div style={{ padding: 12, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No subfolders found</div>
                                    ) : (
                                        filteredSubfolders.map(folder => (
                                            <button key={folder.id} onClick={() => setSelectedSubfolder(folder)}
                                                style={{ width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', background: selectedSubfolder?.id === folder.id ? '#6366f115' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid #f8fafc', color: selectedSubfolder?.id === folder.id ? '#6366f1' : '#374151' }}>
                                                {selectedSubfolder?.id === folder.id ? <FolderOpen size={14} color="#6366f1" /> : <Folder size={14} color="#94a3b8" />}
                                                <span style={{ fontSize: 13 }}>{folder.name}</span>
                                                {selectedSubfolder?.id === folder.id && <ChevronRight size={12} style={{ marginLeft: 'auto' }} />}
                                            </button>
                                        ))
                                    )}
                                </div>

                                {/* Create new subfolder */}
                                {!showNewFolder ? (
                                    <button onClick={() => setShowNewFolder(true)}
                                        style={{ marginTop: 8, width: '100%', padding: '7px', borderRadius: 8, border: '1px dashed #cbd5e1', background: 'transparent', cursor: 'pointer', color: '#6366f1', fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                        <Plus size={13} /> Create New Subfolder
                                    </button>
                                ) : (
                                    <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                                        <input value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
                                            placeholder="New folder name..." autoFocus
                                            onKeyDown={e => { if (e.key === 'Enter') handleCreateGlobalFolder(); if (e.key === 'Escape') setShowNewFolder(false); }}
                                            style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: '1px solid #6366f1', fontSize: 13, outline: 'none' }} />
                                        <button onClick={handleCreateGlobalFolder} disabled={creatingFolder || !newFolderName.trim()}
                                            style={{ padding: '7px 12px', borderRadius: 8, background: '#6366f1', border: 'none', color: '#fff', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                                            {creatingFolder ? <Loader2 size={12} className="spin" /> : <Plus size={12} />} Create
                                        </button>
                                        <button onClick={() => setShowNewFolder(false)} style={{ padding: '7px 10px', borderRadius: 8, background: '#f1f5f9', border: 'none', cursor: 'pointer' }}><X size={14} color="#64748b" /></button>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Path preview + Confirm */}
                        {selectedRoot && (
                            <div style={{ marginTop: 14, padding: '10px 14px', background: '#f8fafc', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                                    <Folder size={13} color="#6366f1" />
                                    <span style={{ fontSize: 12, color: '#475569', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {selectedSubfolder ? `${selectedRoot.label} / ${selectedSubfolder.name}` : selectedRoot.label}
                                    </span>
                                </div>
                                <button onClick={handleConfirmGlobal}
                                    style={{ padding: '7px 16px', borderRadius: 8, background: '#6366f1', border: 'none', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
                                    ✓ Confirm
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

