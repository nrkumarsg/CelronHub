import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
    Folder, FolderOpen, File, FileText, Image as ImageIcon, FileCode, FileVideo, 
    FileAudio, Archive, Database, Search, ChevronRight, ChevronDown, 
    ExternalLink, RefreshCw, Upload, Plus, Trash2, LayoutGrid, List, 
    Eye, Download, Copy, Check, ArrowLeft, Home, Shield, Zap, 
    HardDrive, Clock, Calendar, Briefcase, Smartphone, AlertCircle, 
    Loader2, X, Info
} from 'lucide-react';
import { listFolderContent, uploadFileToDrive, getOrCreateFolder, deleteFile } from '../../lib/driveService';
import { getStoredToken, isTokenValid, connectGoogleAPI } from '../../lib/googleAuthService';
import toast from 'react-hot-toast';

export const DEFAULT_CELRON_ROOT_ID = '1kCdb5celO1Ubo3SQZWCYj96eEmc1VAeJ';
export const DEFAULT_CELRON_ROOT_NAME = 'CELRONHUB';

/**
 * Helper to determine file icon and category based on mimeType and name
 */
export const getFileDetails = (mimeType = '', name = '') => {
    const lowerName = name.toLowerCase();
    
    if (mimeType === 'application/vnd.google-apps.folder') {
        return { type: 'folder', label: 'Folder', color: '#3b82f6', icon: Folder, bg: '#eff6ff' };
    }
    if (mimeType.startsWith('image/') || /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(lowerName)) {
        return { type: 'image', label: 'Image', color: '#ec4899', icon: ImageIcon, bg: '#fdf2f8' };
    }
    if (mimeType.includes('pdf') || lowerName.endsWith('.pdf')) {
        return { type: 'pdf', label: 'PDF', color: '#ef4444', icon: FileText, bg: '#fef2f2' };
    }
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || /\.(xls|xlsx|csv)$/i.test(lowerName)) {
        return { type: 'spreadsheet', label: 'Excel / CSV', color: '#10b981', icon: FileCode, bg: '#ecfdf5' };
    }
    if (mimeType.includes('word') || mimeType.includes('document') || /\.(doc|docx)$/i.test(lowerName)) {
        return { type: 'document', label: 'Document', color: '#2563eb', icon: FileText, bg: '#eff6ff' };
    }
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint') || /\.(ppt|pptx)$/i.test(lowerName)) {
        return { type: 'presentation', label: 'Presentation', color: '#f59e0b', icon: FileText, bg: '#fffbeb' };
    }
    if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('tar') || /\.(zip|rar|7z|tar|gz)$/i.test(lowerName)) {
        return { type: 'archive', label: 'Archive', color: '#8b5cf6', icon: Archive, bg: '#f5f3ff' };
    }
    if (mimeType.startsWith('video/') || /\.(mp4|mov|avi|mkv)$/i.test(lowerName)) {
        return { type: 'video', label: 'Video', color: '#6366f1', icon: FileVideo, bg: '#eef2ff' };
    }
    if (mimeType.startsWith('audio/') || /\.(mp3|wav|ogg|m4a)$/i.test(lowerName)) {
        return { type: 'audio', label: 'Audio', color: '#14b8a6', icon: FileAudio, bg: '#f0fdfa' };
    }
    return { type: 'file', label: 'File', color: '#64748b', icon: File, bg: '#f8fafc' };
};

/**
 * Format bytes to readable string (e.g. 1.2 MB)
 */
export const formatFileSize = (bytes) => {
    if (!bytes || isNaN(bytes)) return '--';
    const num = parseInt(bytes, 10);
    if (num < 1024) return `${num} B`;
    if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
    if (num < 1024 * 1024 * 1024) return `${(num / (1024 * 1024)).toFixed(1)} MB`;
    return `${(num / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

/**
 * TreeNode component for rendering the recursive Google Drive directory tree
 */
function TreeNode({ 
    folder, 
    level = 0, 
    activeFolderId, 
    expandedFolders, 
    treeData, 
    loadingFolders, 
    onToggleExpand, 
    onSelectFolder 
}) {
    const isExpanded = !!expandedFolders[folder.id];
    const isSelected = activeFolderId === folder.id;
    const isLoading = !!loadingFolders[folder.id];
    const children = treeData[folder.id] || [];

    const handleChevronClick = (e) => {
        e.stopPropagation();
        onToggleExpand(folder);
    };

    const handleNodeClick = () => {
        onSelectFolder(folder.id, folder.name);
    };

    return (
        <div style={{ userSelect: 'none' }}>
            <div 
                onClick={handleNodeClick}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 8px',
                    paddingLeft: `${level * 16 + 8}px`,
                    borderRadius: 8,
                    cursor: 'pointer',
                    background: isSelected ? '#eff6ff' : 'transparent',
                    color: isSelected ? '#2563eb' : '#334155',
                    fontWeight: isSelected ? 700 : 500,
                    fontSize: 13,
                    transition: 'background 0.15s, color 0.15s',
                    position: 'relative'
                }}
                onMouseEnter={e => {
                    if (!isSelected) e.currentTarget.style.background = '#f8fafc';
                }}
                onMouseLeave={e => {
                    if (!isSelected) e.currentTarget.style.background = 'transparent';
                }}
            >
                {/* Expand / Collapse toggle button */}
                <button
                    onClick={handleChevronClick}
                    style={{
                        background: 'transparent',
                        border: 'none',
                        padding: 2,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: isSelected ? '#2563eb' : '#94a3b8',
                        borderRadius: 4,
                        width: 18,
                        height: 18,
                        flexShrink: 0
                    }}
                    title={isExpanded ? "Collapse" : "Expand"}
                >
                    {isLoading ? (
                        <Loader2 size={12} className="spin" />
                    ) : (
                        <ChevronRight 
                            size={14} 
                            style={{ 
                                transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                                transition: 'transform 0.15s ease' 
                            }} 
                        />
                    )}
                </button>

                {/* Folder icon */}
                {isExpanded ? (
                    <FolderOpen size={16} color={isSelected ? "#2563eb" : "#3b82f6"} style={{ flexShrink: 0 }} />
                ) : (
                    <Folder size={16} color={isSelected ? "#2563eb" : "#60a5fa"} style={{ flexShrink: 0 }} />
                )}

                {/* Folder Name */}
                <span style={{ 
                    overflow: 'hidden', 
                    textOverflow: 'ellipsis', 
                    whiteSpace: 'nowrap',
                    flex: 1
                }}>
                    {folder.name}
                </span>

                {/* Subfolder count badge if loaded */}
                {children.length > 0 && isExpanded && (
                    <span style={{
                        fontSize: 10,
                        padding: '1px 5px',
                        borderRadius: 10,
                        background: isSelected ? '#dbeafe' : '#f1f5f9',
                        color: isSelected ? '#1d4ed8' : '#64748b',
                        fontWeight: 600
                    }}>
                        {children.length}
                    </span>
                )}
            </div>

            {/* Render Subfolders recursively if expanded */}
            {isExpanded && (
                <div>
                    {children.length === 0 && !isLoading ? (
                        <div style={{ 
                            paddingLeft: `${(level + 1) * 16 + 24}px`, 
                            paddingTop: 3, 
                            paddingBottom: 3, 
                            fontSize: 11, 
                            color: '#94a3b8',
                            fontStyle: 'italic' 
                        }}>
                            No subfolders
                        </div>
                    ) : (
                        children.map(child => (
                            <TreeNode
                                key={child.id}
                                folder={child}
                                level={level + 1}
                                activeFolderId={activeFolderId}
                                expandedFolders={expandedFolders}
                                treeData={treeData}
                                loadingFolders={loadingFolders}
                                onToggleExpand={onToggleExpand}
                                onSelectFolder={onSelectFolder}
                            />
                        ))
                    )}
                </div>
            )}
        </div>
    );
}

/**
 * Main Full Google Drive Explorer with dynamic Tree View
 */
export default function DriveTreeExplorer({ 
    rootFolderId = DEFAULT_CELRON_ROOT_ID, 
    rootFolderName = DEFAULT_CELRON_ROOT_NAME,
    onFileSelected = null,
    height = 'calc(100vh - 180px)',
    allowUpload = true,
    allowCreateFolder = true,
    allowDelete = true
}) {
    const [token, setToken] = useState(() => getStoredToken());
    const [isConnected, setIsConnected] = useState(() => isTokenValid());

    // Navigation & items state
    const [currentFolderId, setCurrentFolderId] = useState(rootFolderId);
    const [currentFolderName, setCurrentFolderName] = useState(rootFolderName);
    const [breadcrumbs, setBreadcrumbs] = useState([{ id: rootFolderId, name: rootFolderName }]);
    const [items, setItems] = useState([]);
    const [loadingItems, setLoadingItems] = useState(false);
    
    // Directory Tree state
    const [rootFolders, setRootFolders] = useState([]);
    const [treeData, setTreeData] = useState({}); // { [parentFolderId]: [childFolder1, ...] }
    const [expandedFolders, setExpandedFolders] = useState({ [rootFolderId]: true });
    const [loadingFolders, setLoadingFolders] = useState({});

    // UI state
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'
    const [previewItem, setPreviewItem] = useState(null);
    const [copiedId, setCopiedId] = useState(null);

    // Upload & New Folder state
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [isCreatingFolder, setIsCreatingFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const fileInputRef = useRef(null);

    // Check Google Auth on mount
    useEffect(() => {
        const storedToken = getStoredToken();
        const valid = isTokenValid();
        setToken(storedToken);
        setIsConnected(valid);
    }, []);

    // Load subfolders for a parent folder into tree
    const fetchSubfolders = useCallback(async (folderId) => {
        if (!isConnected || !token) return [];
        setLoadingFolders(prev => ({ ...prev, [folderId]: true }));
        try {
            const allItems = await listFolderContent(token, folderId);
            const foldersOnly = (allItems || [])
                .filter(item => item.mimeType === 'application/vnd.google-apps.folder')
                .map(f => ({ id: f.id, name: f.name, mimeType: f.mimeType }));

            setTreeData(prev => ({ ...prev, [folderId]: foldersOnly }));
            return foldersOnly;
        } catch (err) {
            console.error(`Failed to fetch tree subfolders for ${folderId}:`, err);
            toast.error(`Could not load folders: ${err.message || 'Network error'}`);
            return [];
        } finally {
            setLoadingFolders(prev => ({ ...prev, [folderId]: false }));
        }
    }, [isConnected, token]);

    // Initial Tree Load (Root folder contents)
    useEffect(() => {
        if (isConnected && token && rootFolderId) {
            fetchSubfolders(rootFolderId).then(folders => {
                setRootFolders(folders);
            });
            loadFolderItems(rootFolderId, rootFolderName);
        }
    }, [isConnected, token, rootFolderId, rootFolderName, fetchSubfolders]);

    // Load full folder contents (folders + files) for main explorer pane
    const loadFolderItems = async (folderId, folderName = null) => {
        if (!isConnected || !token) return;
        setLoadingItems(true);
        try {
            const allFiles = await listFolderContent(token, folderId);
            setItems(allFiles || []);
            setCurrentFolderId(folderId);
            if (folderName) setCurrentFolderName(folderName);
        } catch (err) {
            console.error(`Failed to load folder items for ${folderId}:`, err);
            toast.error(`Error reading folder: ${err.message || 'Drive error'}`);
        } finally {
            setLoadingItems(false);
        }
    };

    // Toggle expand in left directory tree
    const handleToggleExpand = async (folder) => {
        const isCurrentlyExpanded = !!expandedFolders[folder.id];
        const nextExpanded = !isCurrentlyExpanded;

        setExpandedFolders(prev => ({ ...prev, [folder.id]: nextExpanded }));

        // If expanding and children not yet loaded, fetch them
        if (nextExpanded && !treeData[folder.id]) {
            await fetchSubfolders(folder.id);
        }
    };

    // Navigate to a folder when clicked in tree or breadcrumb or double-clicked
    const handleNavigateToFolder = (folderId, folderName) => {
        // Auto expand in tree
        setExpandedFolders(prev => ({ ...prev, [folderId]: true }));
        if (!treeData[folderId]) {
            fetchSubfolders(folderId);
        }

        // Update breadcrumb trail
        setBreadcrumbs(prev => {
            const existingIdx = prev.findIndex(b => b.id === folderId);
            if (existingIdx !== -1) {
                return prev.slice(0, existingIdx + 1);
            }
            return [...prev, { id: folderId, name: folderName }];
        });

        loadFolderItems(folderId, folderName);
    };

    // Quick access shortcut click
    const handleQuickAccess = (folderId, folderName) => {
        handleNavigateToFolder(folderId, folderName);
    };

    // Create New Folder
    const handleCreateFolderSubmit = async (e) => {
        e.preventDefault();
        if (!newFolderName.trim()) return;

        const name = newFolderName.trim();
        setIsCreatingFolder(false);
        setNewFolderName('');

        const toastId = toast.loading(`Creating folder "${name}"...`);
        try {
            const createdId = await getOrCreateFolder(token, name, currentFolderId);
            toast.success(`Folder "${name}" created!`, { id: toastId });

            // Refresh current folder items & tree
            await loadFolderItems(currentFolderId);
            await fetchSubfolders(currentFolderId);
            setExpandedFolders(prev => ({ ...prev, [currentFolderId]: true }));
        } catch (err) {
            console.error('Failed to create folder:', err);
            toast.error(`Failed to create folder: ${err.message}`, { id: toastId });
        }
    };

    // Handle File Upload
    const handleFileUpload = async (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        setUploading(true);
        setUploadProgress(0);

        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const toastId = toast.loading(`Uploading ${file.name} (${i + 1}/${files.length})...`);

                await uploadFileToDrive(token, file, { 
                    folderId: currentFolderId,
                    onProgress: (p) => setUploadProgress(p)
                });

                toast.success(`Uploaded ${file.name}`, { id: toastId });
            }

            // Refresh items
            await loadFolderItems(currentFolderId);
        } catch (err) {
            console.error('Upload error:', err);
            toast.error(`Upload failed: ${err.message}`);
        } finally {
            setUploading(false);
            setUploadProgress(0);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    // Delete item
    const handleDelete = async (item) => {
        if (!window.confirm(`Are you sure you want to permanently delete "${item.name}" from Google Drive?`)) {
            return;
        }

        const toastId = toast.loading(`Deleting "${item.name}"...`);
        try {
            await deleteFile(token, item.id);
            toast.success(`"${item.name}" deleted`, { id: toastId });
            await loadFolderItems(currentFolderId);
            if (item.mimeType === 'application/vnd.google-apps.folder') {
                await fetchSubfolders(currentFolderId);
            }
        } catch (err) {
            console.error('Delete error:', err);
            toast.error(`Failed to delete: ${err.message}`, { id: toastId });
        }
    };

    // Copy Google Drive Web Link
    const handleCopyLink = (item) => {
        const link = item.webViewLink || `https://drive.google.com/drive/folders/${item.id}`;
        navigator.clipboard.writeText(link);
        setCopiedId(item.id);
        toast.success('Link copied to clipboard!');
        setTimeout(() => setCopiedId(null), 2000);
    };

    // Filter items by search
    const filteredItems = items.filter(item => 
        item.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const folderItems = filteredItems.filter(i => i.mimeType === 'application/vnd.google-apps.folder');
    const fileItems = filteredItems.filter(i => i.mimeType !== 'application/vnd.google-apps.folder');

    // If Google Drive is not connected, show connection prompt
    if (!isConnected) {
        return (
            <div style={{
                background: '#ffffff',
                borderRadius: 16,
                border: '1px solid #e2e8f0',
                padding: '48px 24px',
                textAlign: 'center',
                boxShadow: '0 4px 16px rgba(0,0,0,0.04)',
                height: height,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 16
            }}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Database size={32} color="#3b82f6" />
                </div>
                <div>
                    <h3 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', margin: '0 0 6px 0' }}>Google Drive Disconnected</h3>
                    <p style={{ fontSize: 14, color: '#64748b', maxWidth: 460, margin: 0 }}>
                        Please connect your Google Drive account to explore live project folders, files, and directories from CELRONHUB.
                    </p>
                </div>
                <button
                    onClick={() => connectGoogleAPI('drive_explorer')}
                    style={{
                        padding: '10px 24px',
                        borderRadius: 10,
                        background: '#2563eb',
                        border: 'none',
                        color: '#ffffff',
                        fontWeight: 700,
                        fontSize: 14,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        cursor: 'pointer',
                        boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)'
                    }}
                >
                    <Database size={16} /> Connect Google Drive
                </button>
            </div>
        );
    }

    return (
        <div style={{
            background: '#ffffff',
            borderRadius: 16,
            border: '1px solid #e2e8f0',
            overflow: 'hidden',
            boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
            display: 'flex',
            height: height,
            position: 'relative'
        }}>
            {/* ══════════════════════════════════════════════════════════════════ */}
            {/* LEFT SIDEBAR: Interactive GDrive Directory Tree & Quick Access   */}
            {/* ══════════════════════════════════════════════════════════════════ */}
            <div style={{
                width: 300,
                minWidth: 260,
                maxWidth: 360,
                borderRight: '1px solid #e2e8f0',
                background: '#f8fafc',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
            }}>
                {/* Tree Header */}
                <div style={{
                    padding: '14px 16px',
                    borderBottom: '1px solid #e2e8f0',
                    background: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Database size={17} color="#2563eb" />
                        <span style={{ fontWeight: 800, fontSize: 14, color: '#1e293b', letterSpacing: '-0.01em' }}>
                            GDrive Directory Tree
                        </span>
                    </div>
                    <button
                        onClick={() => {
                            fetchSubfolders(rootFolderId).then(folders => setRootFolders(folders));
                            loadFolderItems(currentFolderId);
                        }}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#64748b',
                            padding: 4,
                            borderRadius: 6,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                        title="Refresh Directory Tree"
                    >
                        <RefreshCw size={14} />
                    </button>
                </div>

                {/* Tree Navigation Body */}
                <div style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '12px 10px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 16
                }}>
                    {/* Root Folder Item */}
                    <div>
                        <div 
                            onClick={() => handleNavigateToFolder(rootFolderId, rootFolderName)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                padding: '8px 10px',
                                borderRadius: 10,
                                cursor: 'pointer',
                                background: currentFolderId === rootFolderId ? '#dbeafe' : '#ffffff',
                                color: currentFolderId === rootFolderId ? '#1d4ed8' : '#1e293b',
                                border: '1px solid',
                                borderColor: currentFolderId === rootFolderId ? '#93c5fd' : '#e2e8f0',
                                fontWeight: 800,
                                fontSize: 13,
                                boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                            }}
                        >
                            <Home size={16} color="#2563eb" />
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {rootFolderName} (Root)
                            </span>
                            <a 
                                href={`https://drive.google.com/drive/folders/${rootFolderId}?usp=drive_link`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                style={{ color: '#64748b', display: 'flex', alignItems: 'center' }}
                                title="Open Root in Google Drive"
                            >
                                <ExternalLink size={13} />
                            </a>
                        </div>
                    </div>

                    {/* Collapsible Subfolder Tree */}
                    <div>
                        <div style={{ 
                            fontSize: 11, 
                            fontWeight: 700, 
                            color: '#94a3b8', 
                            textTransform: 'uppercase', 
                            letterSpacing: '0.05em', 
                            paddingLeft: 8, 
                            marginBottom: 6 
                        }}>
                            Folders Hierarchy
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            {rootFolders.length === 0 && loadingFolders[rootFolderId] ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', color: '#94a3b8', fontSize: 12 }}>
                                    <Loader2 size={14} className="spin" />
                                    <span>Loading folders...</span>
                                </div>
                            ) : (
                                rootFolders.map(folder => (
                                    <TreeNode
                                        key={folder.id}
                                        folder={folder}
                                        level={0}
                                        activeFolderId={currentFolderId}
                                        expandedFolders={expandedFolders}
                                        treeData={treeData}
                                        loadingFolders={loadingFolders}
                                        onToggleExpand={handleToggleExpand}
                                        onSelectFolder={handleNavigateToFolder}
                                    />
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* Tree Footer with Google Drive External Link */}
                <div style={{
                    padding: '10px 14px',
                    borderTop: '1px solid #e2e8f0',
                    background: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: 12,
                    color: '#64748b'
                }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e' }} />
                        Drive Live Sync
                    </span>
                    <a
                        href={`https://drive.google.com/drive/folders/${currentFolderId}?usp=drive_link`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            color: '#2563eb',
                            fontWeight: 600,
                            textDecoration: 'none'
                        }}
                    >
                        Open Drive <ExternalLink size={12} />
                    </a>
                </div>
            </div>

            {/* ══════════════════════════════════════════════════════════════════ */}
            {/* RIGHT MAIN AREA: Full File & Folder Explorer View                 */}
            {/* ══════════════════════════════════════════════════════════════════ */}
            <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                background: '#ffffff'
            }}>
                {/* Top Explorer Breadcrumbs & Main Actions Header */}
                <div style={{
                    padding: '12px 20px',
                    borderBottom: '1px solid #e2e8f0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 16,
                    background: '#ffffff'
                }}>
                    {/* Breadcrumbs Trail */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        flex: 1,
                        overflowX: 'auto',
                        whiteSpace: 'nowrap',
                        paddingBottom: 2
                    }}>
                        {breadcrumbs.map((b, idx) => {
                            const isLast = idx === breadcrumbs.length - 1;
                            return (
                                <React.Fragment key={b.id || idx}>
                                    <button
                                        onClick={() => handleNavigateToFolder(b.id, b.name)}
                                        style={{
                                            background: isLast ? '#eff6ff' : 'transparent',
                                            border: 'none',
                                            padding: '4px 8px',
                                            borderRadius: 6,
                                            cursor: 'pointer',
                                            color: isLast ? '#1d4ed8' : '#64748b',
                                            fontWeight: isLast ? 700 : 500,
                                            fontSize: 13,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 4
                                        }}
                                    >
                                        {idx === 0 && <Home size={13} />}
                                        <span>{b.name}</span>
                                    </button>
                                    {!isLast && (
                                        <ChevronRight size={13} color="#cbd5e1" />
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </div>

                    {/* Top Action Buttons */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        {allowUpload && (
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploading}
                                style={{
                                    background: '#ffffff',
                                    border: '1px solid #cbd5e1',
                                    padding: '7px 14px',
                                    borderRadius: 8,
                                    fontSize: 13,
                                    fontWeight: 600,
                                    color: '#1e293b',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    cursor: uploading ? 'not-allowed' : 'pointer',
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                                }}
                            >
                                <Upload size={15} color="#2563eb" />
                                <span>{uploading ? `Uploading (${uploadProgress}%)` : 'Upload Files'}</span>
                            </button>
                        )}

                        {allowCreateFolder && (
                            <button
                                onClick={() => setIsCreatingFolder(true)}
                                style={{
                                    background: '#2563eb',
                                    border: 'none',
                                    padding: '7px 14px',
                                    borderRadius: 8,
                                    fontSize: 13,
                                    fontWeight: 600,
                                    color: '#ffffff',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    cursor: 'pointer',
                                    boxShadow: '0 2px 8px rgba(37, 99, 235, 0.2)'
                                }}
                            >
                                <Plus size={16} />
                                <span>New Folder</span>
                            </button>
                        )}

                        <input 
                            type="file" 
                            ref={fileInputRef} 
                            style={{ display: 'none' }} 
                            multiple 
                            onChange={handleFileUpload} 
                        />
                    </div>
                </div>

                {/* Toolbar: Search Filter & View Mode */}
                <div style={{
                    padding: '10px 20px',
                    borderBottom: '1px solid #f1f5f9',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: '#f8fafc'
                }}>
                    {/* Search Input */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: 8,
                        padding: '6px 10px',
                        width: 280,
                        gap: 8
                    }}>
                        <Search size={15} color="#94a3b8" />
                        <input
                            type="text"
                            placeholder="Search in this folder..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{
                                border: 'none',
                                outline: 'none',
                                background: 'transparent',
                                fontSize: 13,
                                width: '100%',
                                color: '#1e293b'
                            }}
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0 }}
                            >
                                <X size={13} />
                            </button>
                        )}
                    </div>

                    {/* View Controls & Stats */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: 12, color: '#64748b' }}>
                            {folderItems.length} folders, {fileItems.length} files
                        </span>

                        <div style={{ display: 'flex', background: '#e2e8f0', borderRadius: 8, padding: 2 }}>
                            <button
                                onClick={() => setViewMode('grid')}
                                style={{
                                    padding: '5px 8px',
                                    border: 'none',
                                    borderRadius: 6,
                                    background: viewMode === 'grid' ? '#ffffff' : 'transparent',
                                    color: viewMode === 'grid' ? '#2563eb' : '#64748b',
                                    cursor: 'pointer',
                                    boxShadow: viewMode === 'grid' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                                    display: 'flex',
                                    alignItems: 'center'
                                }}
                                title="Grid View"
                            >
                                <LayoutGrid size={15} />
                            </button>
                            <button
                                onClick={() => setViewMode('list')}
                                style={{
                                    padding: '5px 8px',
                                    border: 'none',
                                    borderRadius: 6,
                                    background: viewMode === 'list' ? '#ffffff' : 'transparent',
                                    color: viewMode === 'list' ? '#2563eb' : '#64748b',
                                    cursor: 'pointer',
                                    boxShadow: viewMode === 'list' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                                    display: 'flex',
                                    alignItems: 'center'
                                }}
                                title="List View"
                            >
                                <List size={15} />
                            </button>
                        </div>

                        <button
                            onClick={() => loadFolderItems(currentFolderId)}
                            style={{
                                background: '#ffffff',
                                border: '1px solid #e2e8f0',
                                borderRadius: 8,
                                padding: '6px 10px',
                                color: '#475569',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                                fontSize: 12
                            }}
                            title="Refresh folder content"
                        >
                            <RefreshCw size={13} />
                        </button>
                    </div>
                </div>

                {/* Upload Progress Bar if active */}
                {uploading && (
                    <div style={{ background: '#eff6ff', borderBottom: '1px solid #bfdbfe', padding: '8px 20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#1d4ed8', fontWeight: 600, marginBottom: 4 }}>
                            <span>Uploading to {currentFolderName}...</span>
                            <span>{uploadProgress}%</span>
                        </div>
                        <div style={{ height: 4, background: '#dbeafe', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ height: '100%', background: '#2563eb', width: `${uploadProgress}%`, transition: 'width 0.2s ease' }} />
                        </div>
                    </div>
                )}

                {/* Create Folder Inline Bar */}
                {isCreatingFolder && (
                    <form 
                        onSubmit={handleCreateFolderSubmit}
                        style={{
                            background: '#f8fafc',
                            borderBottom: '1px solid #e2e8f0',
                            padding: '10px 20px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10
                        }}
                    >
                        <Folder size={18} color="#2563eb" />
                        <input
                            type="text"
                            placeholder="Enter new folder name..."
                            value={newFolderName}
                            onChange={(e) => setNewFolderName(e.target.value)}
                            autoFocus
                            style={{
                                padding: '6px 12px',
                                border: '1px solid #2563eb',
                                borderRadius: 6,
                                outline: 'none',
                                fontSize: 13,
                                flex: 1,
                                maxWidth: 320
                            }}
                        />
                        <button
                            type="submit"
                            style={{
                                background: '#2563eb',
                                color: '#fff',
                                border: 'none',
                                padding: '6px 14px',
                                borderRadius: 6,
                                fontSize: 13,
                                fontWeight: 600,
                                cursor: 'pointer'
                            }}
                        >
                            Create
                        </button>
                        <button
                            type="button"
                            onClick={() => { setIsCreatingFolder(false); setNewFolderName(''); }}
                            style={{
                                background: 'transparent',
                                color: '#64748b',
                                border: '1px solid #cbd5e1',
                                padding: '6px 12px',
                                borderRadius: 6,
                                fontSize: 13,
                                cursor: 'pointer'
                            }}
                        >
                            Cancel
                        </button>
                    </form>
                )}

                {/* Explorer File View Content */}
                <div style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: 20,
                    position: 'relative'
                }}>
                    {loadingItems ? (
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            height: '100%',
                            gap: 12,
                            color: '#64748b'
                        }}>
                            <Loader2 size={32} className="spin" color="#2563eb" />
                            <span style={{ fontSize: 14, fontWeight: 500 }}>Reading folder contents...</span>
                        </div>
                    ) : filteredItems.length === 0 ? (
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            height: '80%',
                            color: '#94a3b8',
                            gap: 12
                        }}>
                            <FolderOpen size={48} strokeWidth={1.5} opacity={0.4} />
                            <div style={{ textAlign: 'center' }}>
                                <p style={{ fontSize: 15, fontWeight: 600, color: '#64748b', margin: '0 0 4px 0' }}>
                                    {searchQuery ? 'No matching files or folders found' : 'This folder is empty'}
                                </p>
                                <p style={{ fontSize: 13, margin: 0 }}>
                                    {searchQuery ? 'Try adjusting your search query' : 'Upload files or create folders using the toolbar buttons above'}
                                </p>
                            </div>
                        </div>
                    ) : viewMode === 'grid' ? (
                        /* ─── GRID VIEW ────────────────────────────────────────────── */
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                            {/* Folders Section */}
                            {folderItems.length > 0 && (
                                <div>
                                    <h4 style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 12px 0' }}>
                                        Folders ({folderItems.length})
                                    </h4>
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                                        gap: 14
                                    }}>
                                        {folderItems.map(folder => (
                                            <div
                                                key={folder.id}
                                                onClick={() => handleNavigateToFolder(folder.id, folder.name)}
                                                style={{
                                                    background: '#ffffff',
                                                    border: '1px solid #e2e8f0',
                                                    borderRadius: 12,
                                                    padding: '14px 16px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 12,
                                                    cursor: 'pointer',
                                                    transition: 'all 0.15s ease',
                                                    position: 'relative',
                                                    boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                                                }}
                                                onMouseEnter={e => {
                                                    e.currentTarget.style.borderColor = '#2563eb';
                                                    e.currentTarget.style.background = '#fcfdff';
                                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                                    e.currentTarget.style.boxShadow = '0 6px 16px rgba(37, 99, 235, 0.08)';
                                                }}
                                                onMouseLeave={e => {
                                                    e.currentTarget.style.borderColor = '#e2e8f0';
                                                    e.currentTarget.style.background = '#ffffff';
                                                    e.currentTarget.style.transform = 'none';
                                                    e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.02)';
                                                }}
                                            >
                                                <div style={{
                                                    width: 38,
                                                    height: 38,
                                                    borderRadius: 10,
                                                    background: '#eff6ff',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    flexShrink: 0
                                                }}>
                                                    <Folder size={20} color="#2563eb" fill="#2563eb" fillOpacity={0.15} />
                                                </div>

                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{
                                                        fontSize: 13,
                                                        fontWeight: 700,
                                                        color: '#1e293b',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap'
                                                    }} title={folder.name}>
                                                        {folder.name}
                                                    </div>
                                                    <div style={{ fontSize: 11, color: '#94a3b8' }}>
                                                        Folder
                                                    </div>
                                                </div>

                                                {allowDelete && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleDelete(folder); }}
                                                        style={{
                                                            background: 'transparent',
                                                            border: 'none',
                                                            color: '#94a3b8',
                                                            cursor: 'pointer',
                                                            padding: 4,
                                                            borderRadius: 4,
                                                            opacity: 0.6
                                                        }}
                                                        onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                                                        onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
                                                        title="Delete folder"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Files Section */}
                            {fileItems.length > 0 && (
                                <div>
                                    <h4 style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 12px 0' }}>
                                        Files ({fileItems.length})
                                    </h4>
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                                        gap: 14
                                    }}>
                                        {fileItems.map(file => {
                                            const details = getFileDetails(file.mimeType, file.name);
                                            const IconComp = details.icon;

                                            return (
                                                <div
                                                    key={file.id}
                                                    style={{
                                                        background: '#ffffff',
                                                        border: '1px solid #e2e8f0',
                                                        borderRadius: 12,
                                                        overflow: 'hidden',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        transition: 'all 0.15s ease',
                                                        boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                                                        position: 'relative'
                                                    }}
                                                    onMouseEnter={e => {
                                                        e.currentTarget.style.borderColor = '#2563eb';
                                                        e.currentTarget.style.transform = 'translateY(-2px)';
                                                        e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.08)';
                                                    }}
                                                    onMouseLeave={e => {
                                                        e.currentTarget.style.borderColor = '#e2e8f0';
                                                        e.currentTarget.style.transform = 'none';
                                                        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.02)';
                                                    }}
                                                >
                                                    {/* File Header / Thumbnail */}
                                                    <div 
                                                        onClick={() => setPreviewItem(file)}
                                                        style={{
                                                            height: 100,
                                                            background: details.bg,
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            cursor: 'pointer',
                                                            position: 'relative',
                                                            overflow: 'hidden'
                                                        }}
                                                    >
                                                        {file.thumbnailLink ? (
                                                            <img 
                                                                src={file.thumbnailLink} 
                                                                alt={file.name}
                                                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                            />
                                                        ) : (
                                                            <IconComp size={36} color={details.color} />
                                                        )}

                                                        <span style={{
                                                            position: 'absolute',
                                                            bottom: 6,
                                                            left: 6,
                                                            fontSize: 10,
                                                            fontWeight: 700,
                                                            padding: '2px 6px',
                                                            borderRadius: 4,
                                                            background: '#ffffff',
                                                            color: details.color,
                                                            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                                                        }}>
                                                            {details.label}
                                                        </span>
                                                    </div>

                                                    {/* File Body Info */}
                                                    <div style={{ padding: '10px 12px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                                                        <div>
                                                            <div 
                                                                onClick={() => setPreviewItem(file)}
                                                                style={{
                                                                    fontSize: 13,
                                                                    fontWeight: 600,
                                                                    color: '#1e293b',
                                                                    overflow: 'hidden',
                                                                    textOverflow: 'ellipsis',
                                                                    whiteSpace: 'nowrap',
                                                                    cursor: 'pointer'
                                                                }}
                                                                title={file.name}
                                                            >
                                                                {file.name}
                                                            </div>
                                                            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                                                                {formatFileSize(file.size)}
                                                            </div>
                                                        </div>

                                                        {/* Actions Toolbar */}
                                                        <div style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'space-between',
                                                            marginTop: 10,
                                                            paddingTop: 8,
                                                            borderTop: '1px solid #f1f5f9'
                                                        }}>
                                                            <button
                                                                onClick={() => setPreviewItem(file)}
                                                                style={{ background: 'transparent', border: 'none', padding: 3, cursor: 'pointer', color: '#64748b' }}
                                                                title="Preview"
                                                            >
                                                                <Eye size={14} />
                                                            </button>

                                                            <a
                                                                href={file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                style={{ background: 'transparent', border: 'none', padding: 3, cursor: 'pointer', color: '#2563eb', display: 'flex' }}
                                                                title="Open in Google Drive"
                                                            >
                                                                <ExternalLink size={14} />
                                                            </a>

                                                            <button
                                                                onClick={() => handleCopyLink(file)}
                                                                style={{ background: 'transparent', border: 'none', padding: 3, cursor: 'pointer', color: copiedId === file.id ? '#22c55e' : '#64748b' }}
                                                                title="Copy Link"
                                                            >
                                                                {copiedId === file.id ? <Check size={14} /> : <Copy size={14} />}
                                                            </button>

                                                            {allowDelete && (
                                                                <button
                                                                    onClick={() => handleDelete(file)}
                                                                    style={{ background: 'transparent', border: 'none', padding: 3, cursor: 'pointer', color: '#94a3b8' }}
                                                                    onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                                                                    onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
                                                                    title="Delete"
                                                                >
                                                                    <Trash2 size={14} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        /* ─── LIST VIEW ─────────────────────────────────────────────── */
                        <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: 600 }}>
                                        <th style={{ padding: '10px 16px' }}>Name</th>
                                        <th style={{ padding: '10px 16px' }}>Type</th>
                                        <th style={{ padding: '10px 16px' }}>Size</th>
                                        <th style={{ padding: '10px 16px' }}>Created</th>
                                        <th style={{ padding: '10px 16px', textAlign: 'right' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredItems.map(item => {
                                        const isFolder = item.mimeType === 'application/vnd.google-apps.folder';
                                        const details = getFileDetails(item.mimeType, item.name);
                                        const IconComp = details.icon;

                                        return (
                                            <tr
                                                key={item.id}
                                                onClick={() => isFolder ? handleNavigateToFolder(item.id, item.name) : setPreviewItem(item)}
                                                style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}
                                                onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                            >
                                                <td style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                                                    <IconComp size={18} color={details.color} />
                                                    <span style={{ fontWeight: 600, color: '#1e293b' }}>
                                                        {item.name}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '10px 16px', color: '#64748b' }}>
                                                    {details.label}
                                                </td>
                                                <td style={{ padding: '10px 16px', color: '#64748b' }}>
                                                    {isFolder ? '--' : formatFileSize(item.size)}
                                                </td>
                                                <td style={{ padding: '10px 16px', color: '#64748b' }}>
                                                    {item.createdTime ? new Date(item.createdTime).toLocaleDateString('en-SG') : '--'}
                                                </td>
                                                <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                                                        {!isFolder && (
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); setPreviewItem(item); }}
                                                                style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer' }}
                                                                title="Preview"
                                                            >
                                                                <Eye size={14} />
                                                            </button>
                                                        )}
                                                        <a
                                                            href={item.webViewLink || `https://drive.google.com/drive/folders/${item.id}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            onClick={(e) => e.stopPropagation()}
                                                            style={{ color: '#2563eb', display: 'flex', alignItems: 'center' }}
                                                            title="Open in Drive"
                                                        >
                                                            <ExternalLink size={14} />
                                                        </a>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleCopyLink(item); }}
                                                            style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer' }}
                                                            title="Copy Link"
                                                        >
                                                            {copiedId === item.id ? <Check size={14} color="#22c55e" /> : <Copy size={14} />}
                                                        </button>
                                                        {allowDelete && (
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleDelete(item); }}
                                                                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                                                                onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                                                                onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
                                                                title="Delete"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* ══════════════════════════════════════════════════════════════════ */}
            {/* FILE PREVIEW MODAL                                                */}
            {/* ══════════════════════════════════════════════════════════════════ */}
            {previewItem && (
                <div 
                    onClick={() => setPreviewItem(null)}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(15, 23, 42, 0.65)',
                        backdropFilter: 'blur(4px)',
                        zIndex: 9999,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 24
                    }}
                >
                    <div 
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            background: '#ffffff',
                            borderRadius: 16,
                            width: '100%',
                            maxWidth: 920,
                            maxHeight: '90vh',
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden',
                            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'
                        }}
                    >
                        {/* Modal Header */}
                        <div style={{
                            padding: '14px 20px',
                            borderBottom: '1px solid #e2e8f0',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            background: '#f8fafc'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                                <FileText size={20} color="#2563eb" />
                                <div style={{ minWidth: 0 }}>
                                    <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {previewItem.name}
                                    </h4>
                                    <span style={{ fontSize: 12, color: '#64748b' }}>
                                        {formatFileSize(previewItem.size)}
                                    </span>
                                </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <a
                                    href={previewItem.webViewLink || `https://drive.google.com/file/d/${previewItem.id}/view`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 6,
                                        padding: '6px 12px',
                                        borderRadius: 8,
                                        background: '#eff6ff',
                                        color: '#2563eb',
                                        fontWeight: 600,
                                        fontSize: 13,
                                        textDecoration: 'none'
                                    }}
                                >
                                    <ExternalLink size={14} /> Open in Google Drive
                                </a>

                                <button
                                    onClick={() => setPreviewItem(null)}
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        cursor: 'pointer',
                                        color: '#64748b',
                                        padding: 4,
                                        display: 'flex'
                                    }}
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        {/* Modal Viewer Body */}
                        <div style={{ flex: 1, minHeight: 480, background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {previewItem.mimeType?.startsWith('image/') ? (
                                <img
                                    src={`https://drive.google.com/uc?export=view&id=${previewItem.id}`}
                                    alt={previewItem.name}
                                    style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }}
                                    onError={(e) => {
                                        // Fallback to Google Drive embed iframe if direct image URL fails
                                        e.currentTarget.style.display = 'none';
                                    }}
                                />
                            ) : (
                                <iframe
                                    src={`https://drive.google.com/file/d/${previewItem.id}/preview`}
                                    title={previewItem.name}
                                    style={{ width: '100%', height: '70vh', border: 'none' }}
                                    allow="autoplay"
                                />
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
