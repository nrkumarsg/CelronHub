import React, { useState, useEffect, useCallback } from 'react';
import { Folder, FolderOpen, Plus, Search, ChevronRight, X, Loader2, BookOpen, Award, Ruler, Inbox, Database, RefreshCw } from 'lucide-react';
import { listFolderContent, getOrCreateFolder } from '../../lib/driveService';
import { getStoredToken } from '../../lib/googleAuthService';

// ─── Preset root folder configurations ────────────────────────────────────────
const ROOT_PRESETS = [
    { id: 'manuals',      label: 'Manuals',      icon: BookOpen,  color: '#6366f1', settingKey: 'gdrive_manuals_id' },
    { id: 'certificates', label: 'Certificates', icon: Award,     color: '#f59e0b', settingKey: 'gdrive_certs_id' },
    { id: 'drawings',     label: 'Drawings',     icon: Ruler,     color: '#06b6d4', settingKey: 'gdrive_drawings_id' },
    { id: 'scans',        label: 'Scans Inbox',  icon: Inbox,     color: '#10b981', settingKey: 'gdrive_99_id' },
    { id: 'general',      label: 'General Docs', icon: Database,  color: '#8b5cf6', settingKey: 'gdrive_docs_id' },
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
export default function FolderTargetSelector({ settings, onSelect, onCancel }) {
    const [selectedRoot, setSelectedRoot] = useState(null);
    const [subfolders, setSubfolders] = useState([]);
    const [subSearch, setSubSearch] = useState('');
    const [loadingSubfolders, setLoadingSubfolders] = useState(false);
    const [selectedSubfolder, setSelectedSubfolder] = useState(null);
    const [creatingFolder, setCreatingFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [showNewFolder, setShowNewFolder] = useState(false);
    const [recentTargets] = useState(getRecentTargets());

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

    const handleCreateFolder = async () => {
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

    const handleConfirm = () => {
        const rootId = getRootFolderId(selectedRoot);
        const target = selectedSubfolder
            ? { folderId: selectedSubfolder.id, path: `${selectedRoot.label} / ${selectedSubfolder.name}`, label: selectedSubfolder.name }
            : { folderId: rootId, path: selectedRoot.label, label: selectedRoot.label };
        saveRecentTarget(target);
        onSelect(target);
    };

    const filteredSubfolders = subfolders.filter(f =>
        f.name.toLowerCase().includes(subSearch.toLowerCase())
    );

    const pathDisplay = selectedRoot
        ? selectedSubfolder
            ? `${selectedRoot.label} / ${selectedSubfolder.name}`
            : selectedRoot.label
        : '—';

    return (
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', boxShadow: '0 8px 32px rgba(0,0,0,0.1)', overflow: 'hidden', width: '100%' }}>
            {/* Header */}
            <div style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Folder size={16} color="#fff" />
                    <span style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>Select Destination Folder</span>
                </div>
                {onCancel && <button onClick={onCancel} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center' }}><X size={14} /></button>}
            </div>

            <div style={{ padding: 16 }}>
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
                <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Root Folder</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
                    {ROOT_PRESETS.map(preset => {
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
                                    onKeyDown={e => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') setShowNewFolder(false); }}
                                    style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: '1px solid #6366f1', fontSize: 13, outline: 'none' }} />
                                <button onClick={handleCreateFolder} disabled={creatingFolder || !newFolderName.trim()}
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
                            <span style={{ fontSize: 12, color: '#475569', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pathDisplay}</span>
                        </div>
                        <button onClick={handleConfirm}
                            style={{ padding: '7px 16px', borderRadius: 8, background: '#6366f1', border: 'none', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
                            ✓ Confirm
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
