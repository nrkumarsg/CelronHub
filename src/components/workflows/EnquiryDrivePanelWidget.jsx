/**
 * EnquiryDrivePanelWidget
 * Bilateral Google Drive slide-out panel for a single enquiry.
 * Handles: Open Folder | Sync | Provision | Upload | File navigation per subfolder pill.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    X, Folder, FolderOpen, RefreshCw, Upload, ExternalLink, Eye,
    Download, FileText, Image as ImageIcon, File, AlertCircle,
    CheckCircle2, Loader2, Plus, FolderPlus, HardDrive, Lock
} from 'lucide-react';
import { getStoredToken, isTokenValid } from '../../lib/googleAuthService';
import {
    listFolderContent,
    provisionEnquiryFolderStructure,
    getOrCreateFolder,
    uploadFileToDrive,
} from '../../lib/driveService';
import { saveEnquiryDriveFolderId } from '../../lib/supplierHubProService';
import { getDocumentSettings } from '../../lib/store';
import toast from 'react-hot-toast';
import SmartUploadPanel from '../upload/SmartUploadPanel';

// ─── Known subfolder names (matching provisionEnquiryFolderStructure) ─────────
const SUBFOLDERS = [
    { key: 'enquiry',    label: 'Enquiry Uploads', icon: '📄', name: 'Supplier Enquiry uploads' },
    { key: 'photos',     label: 'Photos & Media',  icon: '📸', name: 'Photos & Media' },
    { key: 'quotations', label: 'Quotes Received', icon: '📞', name: 'Quotations received' },
];

// ─── File icon helper ─────────────────────────────────────────────────────────
const getFileIcon = (mimeType) => {
    if (mimeType?.includes('image/')) return <ImageIcon size={15} color="#10b981" />;
    if (mimeType?.includes('pdf'))    return <FileText  size={15} color="#ef4444" />;
    return <File size={15} color="#3b82f6" />;
};

// ─── Format bytes ────────────────────────────────────────────────────────────
const fmtSize = (bytes) => {
    if (!bytes) return '';
    const kb = Number(bytes) / 1024;
    if (kb < 1024) return `${kb.toFixed(0)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
};

export default function EnquiryDrivePanelWidget({
    enquiry,
    isOpen,
    onClose,
    onFolderProvisioned,  // (folderId) => void — called after provisioning
    companyId,
}) {
    const [tokenValid, setTokenValid] = useState(false);
    const [loading, setLoading] = useState(false);
    const [provisioning, setProvisioning] = useState(false);
    const [syncing, setSyncing] = useState(false);

    const [activePill, setActivePill] = useState('enquiry');
    const [subfolderIds, setSubfolderIds] = useState({});  // { enquiry: id, photos: id, quotations: id }
    const [files, setFiles] = useState([]);                // files in active subfolder
    const [fileCount, setFileCount] = useState(null);      // total file count across all subfolders

    const [uploading, setUploading] = useState(false);
    const [showUploadPanel, setShowUploadPanel] = useState(false);

    const folderId = enquiry?.gdrive_folder_id;

    // ─── Token check ─────────────────────────────────────────────────────────
    useEffect(() => {
        setTokenValid(isTokenValid());
    }, [isOpen]);

    // ─── Auto-load when panel opens ──────────────────────────────────────────
    useEffect(() => {
        if (isOpen && folderId && tokenValid) {
            loadSubfolders();
        }
    }, [isOpen, folderId, tokenValid]);

    // ─── Reload files when pill changes ──────────────────────────────────────
    useEffect(() => {
        const sfId = subfolderIds[activePill];
        if (sfId && tokenValid) {
            loadFilesForPill(sfId);
        } else {
            setFiles([]);
        }
    }, [activePill, subfolderIds]);

    // ─── Load subfolder IDs ───────────────────────────────────────────────────
    const loadSubfolders = useCallback(async () => {
        const token = getStoredToken();
        if (!token || !folderId) return;

        setLoading(true);
        try {
            const ids = {};
            let total = 0;

            for (const sf of SUBFOLDERS) {
                try {
                    const sfId = await getOrCreateFolder(token, sf.name, folderId);
                    ids[sf.key] = sfId;

                    // Count files
                    const sfFiles = await listFolderContent(token, sfId);
                    total += sfFiles.filter(f => f.mimeType !== 'application/vnd.google-apps.folder').length;
                } catch (e) {
                    console.warn(`Failed to load subfolder "${sf.name}":`, e);
                }
            }

            setSubfolderIds(ids);
            setFileCount(total);

            // Load files for current active pill
            if (ids[activePill]) {
                await loadFilesForPill(ids[activePill]);
            }
        } catch (err) {
            console.error('Error loading subfolders:', err);
            toast.error('Failed to read Drive subfolders');
        } finally {
            setLoading(false);
        }
    }, [folderId, activePill]);

    const loadFilesForPill = async (sfId) => {
        const token = getStoredToken();
        if (!token || !sfId) return;
        try {
            const all = await listFolderContent(token, sfId);
            setFiles(all.filter(f => f.mimeType !== 'application/vnd.google-apps.folder'));
        } catch (e) {
            console.warn('Error loading files for subfolder:', e);
            setFiles([]);
        }
    };

    // ─── Sync / Refresh ──────────────────────────────────────────────────────
    const handleSync = async () => {
        setSyncing(true);
        try {
            await loadSubfolders();
            toast.success('Drive folder synced!');
        } finally {
            setSyncing(false);
        }
    };

    // ─── Open folder in new tab ──────────────────────────────────────────────
    const handleOpenFolder = (id = folderId) => {
        if (!id) return;
        window.open(`https://drive.google.com/drive/folders/${id}`, '_blank', 'noopener,noreferrer');
    };

    // ─── Open subfolder in new tab ───────────────────────────────────────────
    const handleOpenSubfolder = () => {
        const sfId = subfolderIds[activePill];
        if (sfId) handleOpenFolder(sfId);
    };

    // ─── Open file in Drive viewer ───────────────────────────────────────────
    const handleOpenFile = (file) => {
        if (file.webViewLink) {
            window.open(file.webViewLink, '_blank', 'noopener,noreferrer');
        }
    };

    // ─── Download file ────────────────────────────────────────────────────────
    const handleDownloadFile = async (file) => {
        const token = getStoredToken();
        if (!token || !file.id) return;
        try {
            const res = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Download failed');
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = file.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            toast.error('Download failed: ' + err.message);
        }
    };

    // ─── Provision enquiry folder structure ───────────────────────────────────
    const handleProvision = async () => {
        const token = getStoredToken();
        if (!token) {
            toast.error('Please connect Google Drive first');
            return;
        }
        if (!enquiry) return;

        setProvisioning(true);
        try {
            const settings = await getDocumentSettings(companyId);
            let rootId = settings?.gdrive_celron_root_id || settings?.google_drive_folder_id;
            if (!rootId) throw new Error('Google Drive Root Folder ID is not configured in Settings.');

            // Extract folder ID from URL if needed
            if (rootId.includes('drive.google.com')) {
                const match = rootId.match(/\/folders\/([a-zA-Z0-9_-]+)/) || rootId.match(/\/d\/([a-zA-Z0-9_-]+)/);
                if (match) rootId = match[1];
            }

            const year = new Date().getFullYear().toString();
            const custName = (enquiry.customer?.name || 'Walk-in').replace(/[^a-zA-Z0-9\s]/g, '').trim().substring(0, 15);
            const folderName = `${enquiry.enquiry_no} - ${custName}`;

            const result = await provisionEnquiryFolderStructure(token, rootId, year, folderName, false);
            const newFolderId = result?.enqFolderId || result;

            // Save to Supabase
            await saveEnquiryDriveFolderId(enquiry.id, newFolderId);

            toast.success(`Drive folder provisioned for ${enquiry.enquiry_no}!`);
            if (onFolderProvisioned) onFolderProvisioned(newFolderId);

            // Load subfolders now
            await loadSubfolders();
        } catch (err) {
            console.error('Provision error:', err);
            toast.error('Provisioning failed: ' + err.message);
        } finally {
            setProvisioning(false);
        }
    };

    if (!isOpen || !enquiry) return null;

    const currentPillId = subfolderIds[activePill];
    const activeSubfolder = SUBFOLDERS.find(s => s.key === activePill);

    return (
        <div style={{
            position: 'fixed',
            right: 0,
            top: 0,
            bottom: 0,
            width: '440px',
            background: '#ffffff',
            borderLeft: '2px solid #e2e8f0',
            boxShadow: '-8px 0 32px rgba(0,0,0,0.10)',
            zIndex: 9000,
            display: 'flex',
            flexDirection: 'column',
            animation: 'slideInRight 0.22s ease-out',
        }}>
            <style>{`
                @keyframes slideInRight {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            `}</style>

            {/* ─── Header ─── */}
            <div style={{
                background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)',
                padding: '14px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid #334155',
                flexShrink: 0,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <HardDrive size={20} color="#60a5fa" />
                    <div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#f8fafc' }}>
                            Google Drive
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                            {enquiry.enquiry_no} {fileCount !== null ? `• ${fileCount} file${fileCount !== 1 ? 's' : ''}` : ''}
                        </div>
                    </div>
                </div>
                <button onClick={onClose} style={{
                    background: 'none', border: 'none', color: '#94a3b8',
                    cursor: 'pointer', padding: '4px', borderRadius: '6px',
                    display: 'flex', alignItems: 'center',
                }}>
                    <X size={18} />
                </button>
            </div>

            {/* ─── Toolbar Buttons ─── */}
            <div style={{
                display: 'flex', gap: '6px', padding: '10px 14px',
                borderBottom: '1px solid #f1f5f9', flexShrink: 0,
                flexWrap: 'wrap', background: '#f8fafc',
            }}>
                {/* Open Root Folder */}
                <button
                    onClick={() => handleOpenFolder()}
                    disabled={!folderId}
                    title="Open enquiry root folder in Google Drive"
                    style={{
                        display: 'flex', alignItems: 'center', gap: '5px',
                        padding: '6px 11px', borderRadius: '8px', fontSize: '0.75rem',
                        fontWeight: 700, cursor: folderId ? 'pointer' : 'not-allowed',
                        background: folderId ? '#eff6ff' : '#f1f5f9',
                        color: folderId ? '#2563eb' : '#94a3b8',
                        border: `1px solid ${folderId ? '#bfdbfe' : '#e2e8f0'}`,
                        transition: 'all 0.15s',
                    }}
                >
                    <FolderOpen size={13} /> Open Folder
                </button>

                {/* Sync */}
                <button
                    onClick={handleSync}
                    disabled={!folderId || syncing || !tokenValid}
                    title="Sync & refresh file list from Drive"
                    style={{
                        display: 'flex', alignItems: 'center', gap: '5px',
                        padding: '6px 11px', borderRadius: '8px', fontSize: '0.75rem',
                        fontWeight: 700, cursor: folderId && tokenValid ? 'pointer' : 'not-allowed',
                        background: '#f0fdf4', color: '#15803d',
                        border: '1px solid #bbf7d0', transition: 'all 0.15s',
                    }}
                >
                    <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} /> Sync
                </button>

                {/* Provision */}
                <button
                    onClick={handleProvision}
                    disabled={provisioning || !tokenValid}
                    title={folderId ? 'Re-provision missing subfolders' : 'Create Drive folder structure for this enquiry'}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '5px',
                        padding: '6px 11px', borderRadius: '8px', fontSize: '0.75rem',
                        fontWeight: 700, cursor: tokenValid ? 'pointer' : 'not-allowed',
                        background: folderId ? '#f8fafc' : '#fef3c7',
                        color: folderId ? '#475569' : '#92400e',
                        border: `1px solid ${folderId ? '#e2e8f0' : '#fde68a'}`,
                        transition: 'all 0.15s',
                    }}
                >
                    {provisioning ? <Loader2 size={13} className="animate-spin" /> : <FolderPlus size={13} />}
                    {folderId ? 'Re-Provision' : 'Provision Folders'}
                </button>

                {/* Upload */}
                <button
                    onClick={() => setShowUploadPanel(!showUploadPanel)}
                    disabled={!folderId || !tokenValid}
                    title="Upload files to this enquiry folder"
                    style={{
                        display: 'flex', alignItems: 'center', gap: '5px',
                        padding: '6px 11px', borderRadius: '8px', fontSize: '0.75rem',
                        fontWeight: 700, cursor: folderId && tokenValid ? 'pointer' : 'not-allowed',
                        background: showUploadPanel ? '#4f46e5' : '#eef2ff',
                        color: showUploadPanel ? '#ffffff' : '#4f46e5',
                        border: '1px solid #c7d2fe', transition: 'all 0.15s',
                    }}
                >
                    <Upload size={13} /> Upload
                </button>
            </div>

            {/* ─── Not Connected Banner ─── */}
            {!tokenValid && (
                <div style={{
                    margin: '12px 14px', padding: '10px 14px', borderRadius: '10px',
                    background: '#fef3c7', border: '1px solid #fde68a',
                    display: 'flex', alignItems: 'center', gap: '8px',
                    fontSize: '0.78rem', color: '#92400e', fontWeight: 600,
                }}>
                    <Lock size={15} /> Google Drive not connected. Connect via Settings.
                </div>
            )}

            {/* ─── No Folder Banner ─── */}
            {tokenValid && !folderId && (
                <div style={{
                    margin: '12px 14px', padding: '12px 14px', borderRadius: '10px',
                    background: '#fffbeb', border: '1px solid #fde68a',
                    display: 'flex', flexDirection: 'column', gap: '8px',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: '#92400e', fontWeight: 700 }}>
                        <AlertCircle size={15} /> No Drive folder linked
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#78350f' }}>
                        Click <strong>Provision Folders</strong> above to create a standard folder structure for this enquiry in Google Drive.
                    </div>
                </div>
            )}

            {/* ─── Smart Upload Panel (slide-down) ─── */}
            {showUploadPanel && folderId && tokenValid && (
                <div style={{ borderBottom: '1px solid #e2e8f0', maxHeight: '320px', overflow: 'hidden', flexShrink: 0 }}>
                    <SmartUploadPanel
                        embedded={true}
                        isOpen={true}
                        onClose={() => setShowUploadPanel(false)}
                        activeFolderId={currentPillId || folderId}
                        activeFolderName={activeSubfolder?.label || enquiry.enquiry_no}
                        runningEnquiryNo={enquiry.enquiry_no}
                        documentType="enquiry"
                        onSelect={() => {
                            setShowUploadPanel(false);
                            setTimeout(() => handleSync(), 1500);
                        }}
                    />
                </div>
            )}

            {/* ─── Subfolder Pill Tabs ─── */}
            {folderId && tokenValid && (
                <div style={{
                    display: 'flex', gap: '6px', padding: '10px 14px',
                    borderBottom: '1px solid #f1f5f9', flexShrink: 0, overflowX: 'auto',
                }}>
                    {SUBFOLDERS.map(sf => (
                        <button
                            key={sf.key}
                            onClick={() => setActivePill(sf.key)}
                            title={`Open ${sf.label} subfolder`}
                            style={{
                                padding: '5px 12px', borderRadius: '20px', fontSize: '0.72rem',
                                fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                                border: activePill === sf.key ? '1.5px solid #6366f1' : '1.5px solid #e2e8f0',
                                background: activePill === sf.key ? '#eef2ff' : '#f8fafc',
                                color: activePill === sf.key ? '#4f46e5' : '#64748b',
                                transition: 'all 0.15s',
                            }}
                        >
                            {sf.icon} {sf.label}
                        </button>
                    ))}

                    {/* Open subfolder in Drive */}
                    {currentPillId && (
                        <button
                            onClick={handleOpenSubfolder}
                            title="Open this subfolder in Google Drive"
                            style={{
                                padding: '5px 10px', borderRadius: '20px', fontSize: '0.72rem',
                                fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                                border: '1px solid #bfdbfe', background: '#eff6ff', color: '#2563eb',
                                display: 'flex', alignItems: 'center', gap: '4px',
                                marginLeft: 'auto',
                            }}
                        >
                            <ExternalLink size={11} /> Open
                        </button>
                    )}
                </div>
            )}

            {/* ─── File List ─── */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 14px' }}>
                {loading && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '120px', gap: '8px', color: '#94a3b8' }}>
                        <Loader2 size={20} className="animate-spin" />
                        <span style={{ fontSize: '0.8rem' }}>Loading Drive files...</span>
                    </div>
                )}

                {!loading && tokenValid && folderId && files.length === 0 && (
                    <div style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                        justifyContent: 'center', height: '120px', gap: '8px', color: '#94a3b8',
                    }}>
                        <Folder size={32} color="#cbd5e1" />
                        <span style={{ fontSize: '0.78rem' }}>No files in {activeSubfolder?.label}</span>
                        <button
                            onClick={() => setShowUploadPanel(true)}
                            style={{
                                fontSize: '0.72rem', fontWeight: 700, color: '#4f46e5',
                                background: '#eef2ff', border: '1px solid #c7d2fe',
                                padding: '4px 12px', borderRadius: '8px', cursor: 'pointer',
                            }}
                        >
                            + Upload First File
                        </button>
                    </div>
                )}

                {!loading && files.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {files.map(file => (
                            <div
                                key={file.id}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    padding: '8px 10px', borderRadius: '10px',
                                    border: '1px solid #f1f5f9', background: '#fafafa',
                                    transition: 'all 0.15s',
                                }}
                                onMouseOver={e => e.currentTarget.style.background = '#f0f4ff'}
                                onMouseOut={e => e.currentTarget.style.background = '#fafafa'}
                            >
                                {/* Icon */}
                                <span style={{ flexShrink: 0 }}>{getFileIcon(file.mimeType)}</span>

                                {/* Name + Size */}
                                <div style={{ flex: 1, overflow: 'hidden' }}>
                                    <div style={{
                                        fontSize: '0.78rem', fontWeight: 600, color: '#1e293b',
                                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                    }} title={file.name}>
                                        {file.name}
                                    </div>
                                    {file.size && (
                                        <div style={{ fontSize: '0.62rem', color: '#94a3b8' }}>{fmtSize(file.size)}</div>
                                    )}
                                </div>

                                {/* Action buttons */}
                                <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                                    {/* View / Open in Drive */}
                                    <button
                                        onClick={() => handleOpenFile(file)}
                                        title="View / Open in Google Drive"
                                        style={{
                                            background: '#eff6ff', border: '1px solid #bfdbfe',
                                            borderRadius: '6px', padding: '4px 7px', cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', gap: '3px',
                                            fontSize: '0.65rem', fontWeight: 700, color: '#2563eb',
                                        }}
                                    >
                                        <ExternalLink size={11} /> Open
                                    </button>

                                    {/* Download */}
                                    <button
                                        onClick={() => handleDownloadFile(file)}
                                        title="Download this file"
                                        style={{
                                            background: '#f0fdf4', border: '1px solid #bbf7d0',
                                            borderRadius: '6px', padding: '4px 7px', cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', gap: '3px',
                                            fontSize: '0.65rem', fontWeight: 700, color: '#15803d',
                                        }}
                                    >
                                        <Download size={11} /> DL
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ─── Footer ─── */}
            {folderId && (
                <div style={{
                    borderTop: '1px solid #f1f5f9', padding: '10px 14px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    flexShrink: 0, background: '#f8fafc',
                }}>
                    <span style={{ fontSize: '0.68rem', color: '#94a3b8', fontFamily: 'monospace' }}>
                        ID: {folderId.substring(0, 20)}...
                    </span>
                    <button
                        onClick={() => handleOpenFolder()}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '5px',
                            background: 'none', border: 'none', color: '#6366f1',
                            fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer',
                        }}
                    >
                        <ExternalLink size={12} /> Open in Drive
                    </button>
                </div>
            )}
        </div>
    );
}
