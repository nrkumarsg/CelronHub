import React, { useState, useEffect, useRef } from 'react';
import { 
    Folder, FolderOpen, FileText, Image as ImageIcon, File, Eye, Download, 
    ExternalLink, Upload, RefreshCcw, Search, ChevronRight, ChevronDown, 
    Sparkles, HardDrive, CheckCircle2, AlertCircle, Loader2, Plus, X, FolderPlus, Trash2,
    ChevronLeft, Maximize2, Minimize2
} from 'lucide-react';
import { listFolderContent, uploadFileToDrive, deleteFile } from '../../lib/driveService';
import { validateToken } from '../../lib/googleAuthService';
import GDriveConnectionModal from '../common/GDriveConnectionModal';
import toast from 'react-hot-toast';

export default function EagleDriveTreeViewer({ 
    jobFolderId, 
    jobNo = 'CEL-2607-6100', 
    customerName = '', 
    companyId = '',
    selectedStage = null
}) {
    const [loading, setLoading] = useState(true);
    const [tokenValid, setTokenValid] = useState(false);
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const [folderTree, setFolderTree] = useState([]);
    const [activeFolder, setActiveFolder] = useState(null);
    const [selectedFile, setSelectedFile] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [deletingFile, setDeletingFile] = useState(false);
    const [isFullWidth, setIsFullWidth] = useState(true);

    const folderTreeRef = useRef([]);
    const prevStageRef = useRef(selectedStage);

    useEffect(() => {
        folderTreeRef.current = folderTree;
    }, [folderTree]);

    const accessToken = localStorage.getItem('google_access_token');

    useEffect(() => {
        checkAuthAndLoad();
    }, [jobFolderId, accessToken]);

    // Stage-based default target folder routing
    // Triggers ONLY when selectedStage actually changes (does NOT reset user file selection on every render)
    useEffect(() => {
        if (!selectedStage) return;
        if (prevStageRef.current === selectedStage) return;
        prevStageRef.current = selectedStage;

        const currentTree = folderTreeRef.current;
        if (!currentTree || currentTree.length === 0) return;
        const rootNode = currentTree[0];
        if (!rootNode) return;

        let targetNode = rootNode;
        if (selectedStage === 'ENQ' || selectedStage === 'PAID') {
            targetNode = rootNode;
        } else if (selectedStage === 'DEL' || selectedStage === 'QTN' || selectedStage === 'PO') {
            const found = (rootNode.children || []).find(c => c.name.toLowerCase().includes('supportdocs'));
            if (found) targetNode = found;
        } else if (selectedStage === 'INV') {
            const found = (rootNode.children || []).find(c => c.name.toLowerCase().includes('worksuite'));
            if (found) targetNode = found;
        } else if (selectedStage === 'SRC') {
            const found = (rootNode.children || []).find(c => c.name.toLowerCase().includes('supplierbills') || c.name.toLowerCase().includes('supplier'));
            if (found) targetNode = found;
        }

        if (targetNode) {
            setActiveFolder(targetNode);
            if (targetNode.files && targetNode.files.length > 0) {
                setSelectedFile(targetNode.files[0]);
            }
            setFolderTree(prev => prev.map(rn => ({
                ...rn,
                isExpanded: true,
                children: (rn.children || []).map(cn => cn.id === targetNode.id ? { ...cn, isExpanded: true } : cn)
            })));
        }
    }, [selectedStage]);

    const checkAuthAndLoad = async () => {
        setLoading(true);
        try {
            const isValid = await validateToken(accessToken);
            setTokenValid(isValid);

            if (isValid && (jobFolderId || jobNo)) {
                await loadFolderStructure();
            }
        } catch (err) {
            console.error('Error initializing Drive Tree Viewer:', err);
        } finally {
            setLoading(false);
        }
    };

    const loadFolderStructure = async () => {
        if (!accessToken) return;
        setLoading(true);
        try {
            let targetFolderId = jobFolderId;
            if (!targetFolderId) {
                const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`name contains '${jobNo}' and mimeType='application/vnd.google-apps.folder' and trashed=false`)}`, {
                    headers: { 'Authorization': 'Bearer ' + accessToken }
                });
                if (searchRes.ok) {
                    const data = await searchRes.json();
                    if (data.files && data.files.length > 0) {
                        targetFolderId = data.files[0].id;
                    }
                }
            }

            if (!targetFolderId) {
                setFolderTree([]);
                setLoading(false);
                return;
            }

            const buildFolderNode = async (folder) => {
                try {
                    const subFiles = await listFolderContent(accessToken, folder.id);
                    const subFolders = subFiles.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
                    const subNonFolders = subFiles.filter(f => f.mimeType !== 'application/vnd.google-apps.folder');

                    const childFolderNodes = await Promise.all(subFolders.map(sf => buildFolderNode(sf)));

                    return {
                        id: folder.id,
                        name: folder.name,
                        mimeType: folder.mimeType,
                        webViewLink: folder.webViewLink || `https://drive.google.com/drive/folders/${folder.id}`,
                        isExpanded: false,
                        children: childFolderNodes,
                        files: subNonFolders
                    };
                } catch (e) {
                    console.warn(`Error building folder node for ${folder.id}:`, e);
                    return {
                        id: folder.id,
                        name: folder.name,
                        mimeType: folder.mimeType,
                        webViewLink: folder.webViewLink || `https://drive.google.com/drive/folders/${folder.id}`,
                        isExpanded: false,
                        children: [],
                        files: []
                    };
                }
            };

            const rootNode = {
                id: targetFolderId,
                name: `${jobNo} Workspace Folder`,
                mimeType: 'application/vnd.google-apps.folder',
                webViewLink: `https://drive.google.com/drive/folders/${targetFolderId}`,
                isExpanded: true,
                children: [],
                files: []
            };

            const files = await listFolderContent(accessToken, targetFolderId);
            const folders = files.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
            const rootFiles = files.filter(f => f.mimeType !== 'application/vnd.google-apps.folder');

            rootNode.files = rootFiles;
            rootNode.children = await Promise.all(folders.map(f => buildFolderNode(f)));
            setFolderTree([rootNode]);
            setActiveFolder(rootNode);

            if (rootFiles.length > 0) {
                setSelectedFile(rootFiles[0]);
            } else if (rootNode.children.length > 0 && rootNode.children[0].files.length > 0) {
                setSelectedFile(rootNode.children[0].files[0]);
            }
        } catch (err) {
            console.error('Error loading Drive folder tree:', err);
            toast.error('Failed to load Google Drive folder tree');
        } finally {
            setLoading(false);
        }
    };

    const toggleFolderExpand = (folderId) => {
        setFolderTree(prev => {
            const updateNode = (nodes) => {
                return nodes.map(node => {
                    if (node.id === folderId) {
                        return { ...node, isExpanded: !node.isExpanded };
                    }
                    if (node.children && node.children.length > 0) {
                        return { ...node, children: updateNode(node.children) };
                    }
                    return node;
                });
            };
            return updateNode(prev);
        });
    };

    const handleFileUpload = async (e, specificFolderId = null, specificFolderName = null) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const targetFolder = specificFolderId || activeFolder?.id || jobFolderId;
        const targetName = specificFolderName || activeFolder?.name || 'Drive Folder';
        if (!targetFolder) {
            toast.error('No target folder selected for upload');
            return;
        }

        setUploading(true);
        setUploadProgress(10);

        try {
            const uploaded = await uploadFileToDrive(accessToken, file, {
                folderId: targetFolder,
                title: file.name
            }, (progress) => setUploadProgress(progress));

            toast.success(`Uploaded ${file.name} to ${targetName}`);
            await loadFolderStructure();
            if (uploaded) setSelectedFile(uploaded);
        } catch (err) {
            console.error('Upload error:', err);
            toast.error(err.message || 'File upload failed');
        } finally {
            setUploading(false);
            setUploadProgress(0);
            if (e.target) e.target.value = '';
        }
    };

    const handleProvisionProjectFolder = async () => {
        if (!accessToken) {
            setIsAuthModalOpen(true);
            return;
        }
        setLoading(true);
        try {
            const { getDocumentSettings: fetchDocSettings } = await import('../../lib/store');
            const { provisionFullProjectStructure } = await import('../../lib/driveService');
            const docSettings = await fetchDocSettings(companyId);
            let celronRootId = docSettings?.gdrive_celron_root_id || docSettings?.google_drive_folder_id;
            if (!celronRootId) throw new Error('Google Drive Root Folder ID is not configured in Settings.');

            if (celronRootId.includes('drive.google.com')) {
                const match = celronRootId.match(/\/folders\/([a-zA-Z0-9_-]+)/) || celronRootId.match(/\/d\/([a-zA-Z0-9_-]+)/);
                if (match) celronRootId = match[1];
            }

            const currentYear = new Date().getFullYear().toString();
            const cleanCust = (customerName || 'Walk-in').replace(/[^a-zA-Z0-9\s]/g, '').trim().substring(0, 15);
            const projName = `${jobNo} - ${cleanCust}`;

            await provisionFullProjectStructure(accessToken, celronRootId, currentYear, projName);
            toast.success(`Standard project folders created for Job ${jobNo}!`);
            await loadFolderStructure();
        } catch (err) {
            console.error('Failed to provision folder:', err);
            toast.error('Provisioning failed: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteSelectedFile = async () => {
        if (!selectedFile) return;
        if (!window.confirm(`Are you sure you want to delete "${selectedFile.name}" from Google Drive?`)) {
            return;
        }
        setDeletingFile(true);
        const deleteToast = toast.loading(`Deleting "${selectedFile.name}" from Google Drive...`);
        try {
            await deleteFile(accessToken, selectedFile.id);
            toast.dismiss(deleteToast);
            toast.success(`Deleted "${selectedFile.name}" successfully!`);
            setSelectedFile(null);
            await loadFolderStructure();
        } catch (err) {
            toast.dismiss(deleteToast);
            console.error('Failed to delete file from Drive:', err);
            toast.error('Failed to delete file: ' + (err.message || 'Drive error'));
        } finally {
            setDeletingFile(false);
        }
    };

    const getFileIcon = (mimeType) => {
        if (mimeType?.includes('image/')) return <ImageIcon size={18} style={{ color: '#10b981' }} />;
        if (mimeType?.includes('pdf')) return <FileText size={18} style={{ color: '#ef4444' }} />;
        return <File size={18} style={{ color: '#3b82f6' }} />;
    };

    // Files in active folder for sequential next/previous browsing
    const currentFolderFiles = (activeFolder?.files || (folderTree[0]?.files) || []).filter(f => 
        !searchTerm || f.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    const currentFileIndex = currentFolderFiles.findIndex(f => f.id === selectedFile?.id);
    const hasPrev = currentFileIndex > 0;
    const hasNext = currentFileIndex >= 0 && currentFileIndex < currentFolderFiles.length - 1;

    const handlePrevFile = () => {
        if (hasPrev) setSelectedFile(currentFolderFiles[currentFileIndex - 1]);
    };

    const handleNextFile = () => {
        if (hasNext) setSelectedFile(currentFolderFiles[currentFileIndex + 1]);
    };

    // Keyboard navigation (Arrow keys)
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                if (currentFileIndex >= 0 && currentFileIndex < currentFolderFiles.length - 1) {
                    e.preventDefault();
                    setSelectedFile(currentFolderFiles[currentFileIndex + 1]);
                }
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                if (currentFileIndex > 0) {
                    e.preventDefault();
                    setSelectedFile(currentFolderFiles[currentFileIndex - 1]);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentFileIndex, currentFolderFiles]);

    const renderFolderNode = (node, depth = 0) => {
        const isSelected = activeFolder?.id === node.id;
        const matchingFiles = (node.files || []).filter(f => 
            !searchTerm || f.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
        const folderLink = node.webViewLink || `https://drive.google.com/drive/folders/${node.id}`;

        return (
            <div key={node.id} style={{ marginLeft: `${depth * 14}px`, margin: '4px 0' }}>
                {/* Folder Item Row */}
                <div 
                    onClick={() => setActiveFolder(node)}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        background: isSelected ? '#eef2ff' : 'transparent',
                        border: isSelected ? '1px solid #c7d2fe' : '1px solid transparent',
                        color: isSelected ? '#4338ca' : '#334155',
                        fontWeight: isSelected ? 700 : 500,
                        transition: 'all 0.2s ease'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', flex: 1, minWidth: 0 }}>
                        <button 
                            onClick={(e) => { e.stopPropagation(); toggleFolderExpand(node.id); }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#64748b', display: 'flex', alignItems: 'center' }}
                        >
                            {node.isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </button>
                        {node.isExpanded ? <FolderOpen size={18} style={{ color: '#f59e0b', flexShrink: 0 }} /> : <Folder size={18} style={{ color: '#f59e0b', flexShrink: 0 }} />}
                        <span title={node.name} style={{ fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{node.name}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, marginLeft: '8px' }}>
                        {/* Quick upload directly to this correspondence folder */}
                        <label
                            onClick={(e) => {
                                e.stopPropagation();
                                setActiveFolder(node);
                            }}
                            title={`Upload document directly into "${node.name}"`}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                padding: '2px 6px',
                                borderRadius: '5px',
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                color: '#059669',
                                background: '#ecfdf5',
                                border: '1px solid #a7f3d0',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                            }}
                            onMouseOver={(e) => {
                                e.currentTarget.style.background = '#059669';
                                e.currentTarget.style.color = '#ffffff';
                            }}
                            onMouseOut={(e) => {
                                e.currentTarget.style.background = '#ecfdf5';
                                e.currentTarget.style.color = '#059669';
                            }}
                        >
                            <Upload size={10} />
                            <span>Upload</span>
                            <input 
                                type="file" 
                                style={{ display: 'none' }} 
                                onChange={(e) => {
                                    setActiveFolder(node);
                                    handleFileUpload(e, node.id, node.name);
                                }} 
                            />
                        </label>

                        {/* Online Link to open folder in new window */}
                        <a
                            href={folderLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            title={`Open folder "${node.name}" in Google Drive (new window)`}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                color: isSelected ? '#4338ca' : '#4f46e5',
                                background: isSelected ? 'rgba(67, 56, 202, 0.12)' : '#eef2ff',
                                border: '1px solid rgba(79, 70, 229, 0.2)',
                                textDecoration: 'none',
                                transition: 'all 0.15s ease'
                            }}
                            onMouseOver={(e) => {
                                e.currentTarget.style.background = '#4f46e5';
                                e.currentTarget.style.color = '#ffffff';
                            }}
                            onMouseOut={(e) => {
                                e.currentTarget.style.background = isSelected ? 'rgba(67, 56, 202, 0.12)' : '#eef2ff';
                                e.currentTarget.style.color = isSelected ? '#4338ca' : '#4f46e5';
                            }}
                        >
                            <ExternalLink size={12} />
                            <span>Drive</span>
                        </a>

                        <span style={{ fontSize: '0.7rem', background: '#e2e8f0', color: '#475569', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>
                            {node.files?.length || 0}
                        </span>
                    </div>
                </div>

                {/* Sub-Files */}
                {node.isExpanded && (
                    <div style={{ paddingLeft: '20px', borderLeft: '2px solid #e2e8f0', marginLeft: '12px', marginTop: '4px', marginBottom: '4px' }}>
                        {matchingFiles.map(file => {
                            const isFileSelected = selectedFile?.id === file.id;
                            return (
                                <div 
                                    key={file.id}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveFolder(node);
                                        setSelectedFile(file);
                                    }}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        padding: '6px 10px',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        fontSize: '0.8rem',
                                        margin: '2px 0',
                                        background: isFileSelected ? '#4f46e5' : 'transparent',
                                        color: isFileSelected ? '#ffffff' : '#475569',
                                        fontWeight: isFileSelected ? 600 : 400,
                                        boxShadow: isFileSelected ? '0 2px 4px rgba(79,70,229,0.2)' : 'none'
                                    }}
                                >
                                    {getFileIcon(file.mimeType)}
                                    <span title={file.name} style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</span>
                                    {file.size && (
                                        <span style={{ fontSize: '0.7rem', color: isFileSelected ? '#c7d2fe' : '#94a3b8', flexShrink: 0, marginLeft: '8px' }}>
                                            {(file.size / 1024).toFixed(0)} KB
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                        {matchingFiles.length === 0 && node.files?.length === 0 && (
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic', padding: '4px 8px' }}>Folder is empty</div>
                        )}
                        {/* Recursive Sub-folders */}
                        {node.children && node.children.map(child => renderFolderNode(child, depth + 1))}
                    </div>
                )}
            </div>
        );
    };

    if (!tokenValid) {
        return (
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '32px', textAlign: 'center', maxWidth: '500px', margin: '24px auto', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
                <div style={{ width: '56px', height: '56px', background: '#e0e7ff', color: '#4f46e5', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                    <HardDrive size={28} />
                </div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#1e293b', marginBottom: '8px' }}>Connect Google Drive</h3>
                <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '24px', lineHeight: 1.5 }}>
                    Connect your Google Drive account to view the full folder hierarchy and inspect job documentation files live.
                </p>
                <button
                    onClick={() => setIsAuthModalOpen(true)}
                    style={{ background: '#4f46e5', color: '#ffffff', border: 'none', padding: '10px 24px', borderRadius: '12px', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(79,70,229,0.3)' }}
                >
                    <Sparkles size={16} /> Connect Google Drive
                </button>
                <GDriveConnectionModal
                    isOpen={isAuthModalOpen}
                    onClose={() => setIsAuthModalOpen(false)}
                    onSuccess={() => {
                        setIsAuthModalOpen(false);
                        checkAuthAndLoad();
                    }}
                />
            </div>
        );
    }

    return (
        <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', overflow: 'hidden', minHeight: '600px', display: 'flex', flexDirection: 'column' }}>
            {/* Header Toolbar */}
            <div style={{ background: '#0f172a', color: '#ffffff', padding: '16px 20px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyBetween: 'space-between', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                    <div style={{ width: '40px', height: '40px', background: 'rgba(245, 158, 11, 0.2)', border: '1px solid rgba(245, 158, 11, 0.3)', color: '#fbbf24', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <FolderOpen size={20} />
                    </div>
                    <div>
                        <h2 style={{ fontSize: '1rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            Google Drive Folder Tree
                            <span style={{ fontSize: '0.7rem', background: 'rgba(245, 158, 11, 0.2)', color: '#fde68a', border: '1px solid rgba(245, 158, 11, 0.3)', padding: '2px 8px', borderRadius: '6px' }}>
                                Job: {jobNo}
                            </span>
                        </h2>
                        <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: 0 }}>Interactive repository tree with live document viewer</p>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    {/* Active Target Folder Indicator */}
                    {activeFolder && (
                        <div style={{
                            background: 'rgba(99, 102, 241, 0.25)',
                            border: '1px solid rgba(165, 180, 252, 0.4)',
                            color: '#c7d2fe',
                            padding: '5px 12px',
                            borderRadius: '8px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}>
                            <Folder size={13} color="#f59e0b" />
                            <span>Target: <strong style={{ color: '#ffffff' }}>{activeFolder.name}</strong></span>
                        </div>
                    )}

                    {/* Search Input */}
                    <div style={{ position: 'relative' }}>
                        <Search size={14} style={{ position: 'absolute', left: '10px', top: '9px', color: '#94a3b8' }} />
                        <input
                            type="text"
                            placeholder="Filter files in tree..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            style={{ background: '#1e293b', border: '1px solid #334155', color: '#f8fafc', fontSize: '0.8rem', paddingLeft: '30px', paddingRight: '12px', paddingTop: '6px', paddingBottom: '6px', borderRadius: '8px', width: '180px', outline: 'none' }}
                        />
                    </div>

                    {/* Refresh Button */}
                    <button
                        onClick={loadFolderStructure}
                        disabled={loading}
                        style={{ background: '#1e293b', color: '#cbd5e1', border: '1px solid #334155', padding: '6px 12px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                        title="Reload Folder Tree"
                    >
                        <RefreshCcw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
                    </button>

                    {/* Upload File Button */}
                    <label style={{ background: '#4f46e5', color: '#ffffff', padding: '6px 14px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 2px 6px rgba(79,70,229,0.3)' }} title={`Upload file into ${activeFolder?.name || 'Job Folder'}`}>
                        <Upload size={14} /> Upload File
                        <input type="file" onChange={(e) => handleFileUpload(e)} style={{ display: 'none' }} />
                    </label>
                </div>
            </div>

            {/* Upload Progress Bar */}
            {uploading && (
                <div style={{ background: '#eef2ff', borderBottom: '1px solid #c7d2fe', padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.8rem', color: '#4338ca', fontWeight: 700 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Loader2 size={14} className="animate-spin" /> Uploading to Drive ({uploadProgress}%)...
                    </span>
                    <div style={{ width: '120px', background: '#c7d2fe', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ background: '#4f46e5', height: '100%', width: `${uploadProgress}%`, transition: 'width 0.2s ease' }} />
                    </div>
                </div>
            )}

            {/* Main Split Layout: Left Folder Tree (min 460px / 45%) | Right Viewer Pane (less width, full width file) */}
            <style>{`
                @media (max-width: 960px) {
                    .eagle-drive-split-layout {
                        grid-template-columns: 1fr !important;
                    }
                }
            `}</style>
            <div className="eagle-drive-split-layout" style={{ flex: 1, display: 'grid', gridTemplateColumns: 'minmax(460px, 45%) 1fr', minHeight: '560px' }}>
                {/* Left Pane: Folder Tree */}
                <div style={{ padding: '16px', overflowY: 'auto', maxHeight: '680px', background: '#f8fafc', borderRight: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Directory Tree</span>
                        <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 400 }}>Click folder to select target</span>
                    </div>

                    {loading ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyCenter: 'center', padding: '64px 0', color: '#94a3b8', gap: '8px' }}>
                            <Loader2 size={24} className="animate-spin text-indigo-600" />
                            <span style={{ fontSize: '0.8rem' }}>Loading folder hierarchy...</span>
                        </div>
                    ) : folderTree.length > 0 ? (
                        <div>
                            {folderTree.map(node => renderFolderNode(node))}
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '48px 16px', color: '#64748b', fontSize: '0.8rem' }}>
                            <AlertCircle size={32} style={{ margin: '0 auto 10px', color: '#94a3b8' }} />
                            <p style={{ margin: '0 0 14px 0', fontSize: '0.85rem' }}>No Drive folders found for job <strong>{jobNo}</strong>.</p>
                            <button
                                onClick={handleProvisionProjectFolder}
                                disabled={loading}
                                style={{
                                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                                    color: '#0f172a',
                                    border: 'none',
                                    padding: '8px 18px',
                                    borderRadius: '8px',
                                    fontWeight: 800,
                                    fontSize: '0.8rem',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    boxShadow: '0 2px 8px rgba(245,158,11,0.3)'
                                }}
                            >
                                <FolderPlus size={15} /> Provision Standard Job Folders
                            </button>
                        </div>
                    )}
                </div>

                {/* Right Pane: Live File Previewer */}
                <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', background: '#ffffff', minWidth: 0 }}>
                    {selectedFile ? (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>
                            {/* File Info Bar */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', overflow: 'hidden', minWidth: 0, flex: 1 }}>
                                    {getFileIcon(selectedFile.mimeType)}
                                    <div style={{ overflow: 'hidden', minWidth: 0 }}>
                                        <h4 style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0f172a', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={selectedFile.name}>
                                            {selectedFile.name}
                                        </h4>
                                        <div style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', gap: '12px', marginTop: '2px' }}>
                                            <span>Type: {selectedFile.mimeType?.split('/')[1] || 'File'}</span>
                                            {selectedFile.size && (
                                                <span>Size: {(selectedFile.size / 1024).toFixed(1)} KB</span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                    {/* Full Width / Fit Screen Toggle for Images */}
                                    {selectedFile.mimeType?.includes('image/') && (
                                        <button
                                            type="button"
                                            onClick={() => setIsFullWidth(!isFullWidth)}
                                            style={{
                                                background: isFullWidth ? '#e0e7ff' : '#ffffff',
                                                color: isFullWidth ? '#4338ca' : '#475569',
                                                border: isFullWidth ? '1px solid #a5b4fc' : '1px solid #cbd5e1',
                                                padding: '5px 10px',
                                                borderRadius: '8px',
                                                fontSize: '0.75rem',
                                                fontWeight: 700,
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px',
                                                boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                                                transition: 'all 0.15s ease'
                                            }}
                                            title={isFullWidth ? 'Switch to Fit Screen' : 'Switch to Full Width'}
                                        >
                                            {isFullWidth ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                                            <span>{isFullWidth ? 'Fit Screen' : 'Full Width'}</span>
                                        </button>
                                    )}

                                    {/* Prev / Next file step selector */}
                                    {currentFolderFiles.length > 1 && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#ffffff', border: '1px solid #cbd5e1', padding: '3px 8px', borderRadius: '8px', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
                                            <button
                                                type="button"
                                                onClick={handlePrevFile}
                                                disabled={!hasPrev}
                                                style={{
                                                    background: hasPrev ? '#eff6ff' : '#f8fafc',
                                                    border: '1px solid #e2e8f0',
                                                    borderRadius: '6px',
                                                    padding: '4px 8px',
                                                    cursor: hasPrev ? 'pointer' : 'not-allowed',
                                                    opacity: hasPrev ? 1 : 0.4,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '2px',
                                                    fontSize: '0.75rem',
                                                    fontWeight: 700,
                                                    color: hasPrev ? '#1e40af' : '#94a3b8'
                                                }}
                                                title="Previous file (or press Left Arrow)"
                                            >
                                                <ChevronLeft size={14} /> Prev
                                            </button>
                                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569', padding: '0 6px', whiteSpace: 'nowrap' }}>
                                                {currentFileIndex >= 0 ? `${currentFileIndex + 1} of ${currentFolderFiles.length}` : `${currentFolderFiles.length} files`}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={handleNextFile}
                                                disabled={!hasNext}
                                                style={{
                                                    background: hasNext ? '#eff6ff' : '#f8fafc',
                                                    border: '1px solid #e2e8f0',
                                                    borderRadius: '6px',
                                                    padding: '4px 8px',
                                                    cursor: hasNext ? 'pointer' : 'not-allowed',
                                                    opacity: hasNext ? 1 : 0.4,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '2px',
                                                    fontSize: '0.75rem',
                                                    fontWeight: 700,
                                                    color: hasNext ? '#1e40af' : '#94a3b8'
                                                }}
                                                title="Next file (or press Right Arrow)"
                                            >
                                                Next <ChevronRight size={14} />
                                            </button>
                                        </div>
                                    )}

                                    {selectedFile.webViewLink && (
                                        <a
                                            href={selectedFile.webViewLink}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{ background: '#ffffff', color: '#334155', border: '1px solid #cbd5e1', padding: '6px 14px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
                                        >
                                            <ExternalLink size={13} /> Open in Drive
                                        </a>
                                    )}
                                    <button
                                        type="button"
                                        onClick={handleDeleteSelectedFile}
                                        disabled={deletingFile}
                                        style={{
                                            background: '#fef2f2',
                                            color: '#dc2626',
                                            border: '1px solid #fecaca',
                                            padding: '6px 14px',
                                            borderRadius: '8px',
                                            fontSize: '0.8rem',
                                            fontWeight: 700,
                                            cursor: deletingFile ? 'not-allowed' : 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                                            transition: 'all 0.15s ease'
                                        }}
                                        title="Delete this file from Google Drive"
                                    >
                                        {deletingFile ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                                        Delete File
                                    </button>
                                </div>
                            </div>

                            {/* Live File Viewer Box */}
                            <div style={{ flex: 1, background: '#0f172a', borderRadius: '12px', overflow: 'hidden', border: '1px solid #1e293b', minHeight: '560px', maxHeight: '700px', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                                {selectedFile.mimeType?.includes('image/') ? (
                                    <div style={{
                                        width: '100%',
                                        height: '100%',
                                        display: 'flex',
                                        alignItems: isFullWidth ? 'flex-start' : 'center',
                                        justifyContent: 'center',
                                        overflowY: 'auto',
                                        maxHeight: '700px',
                                        padding: isFullWidth ? 0 : '12px'
                                    }}>
                                        <img
                                            src={`https://lh3.googleusercontent.com/d/${selectedFile.id}=w1200`}
                                            alt={selectedFile.name}
                                            style={{
                                                width: isFullWidth ? '100%' : 'auto',
                                                maxWidth: '100%',
                                                maxHeight: isFullWidth ? 'none' : '580px',
                                                objectFit: 'contain',
                                                borderRadius: isFullWidth ? '0' : '8px',
                                                display: 'block'
                                            }}
                                        />
                                    </div>
                                ) : null}

                                {selectedFile.mimeType?.includes('pdf') || selectedFile.mimeType?.includes('document') || selectedFile.mimeType?.includes('sheet') ? (
                                    <iframe
                                        src={`https://drive.google.com/file/d/${selectedFile.id}/preview`}
                                        title={selectedFile.name}
                                        style={{ width: '100%', height: '580px', border: 'none' }}
                                        allow="autoplay"
                                    />
                                ) : !selectedFile.mimeType?.includes('image/') ? (
                                    <div style={{ textAlign: 'center', padding: '32px', color: '#cbd5e1', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                                        <FileText size={48} style={{ color: '#64748b' }} />
                                        <div>
                                            <p style={{ fontSize: '0.9rem', fontWeight: 700, margin: 0 }}>{selectedFile.name}</p>
                                            <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '4px' }}>Preview not inlineable for this file format.</p>
                                        </div>
                                        {selectedFile.webViewLink && (
                                            <a
                                                href={selectedFile.webViewLink}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                style={{ background: '#4f46e5', color: '#ffffff', padding: '8px 16px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px', marginTop: '8px' }}
                                            >
                                                <ExternalLink size={14} /> Open File in Google Drive
                                            </a>
                                        )}
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    ) : (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyCenter: 'center', padding: '48px', color: '#94a3b8', border: '2px dashed #e2e8f0', borderRadius: '12px', margin: '8px' }}>
                            <Eye size={36} style={{ color: '#cbd5e1', marginBottom: '8px' }} />
                            <p style={{ fontSize: '0.9rem', fontWeight: 700, color: '#475569', margin: 0 }}>No File Selected</p>
                            <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '4px', textAlign: 'center' }}>
                                Select any file from the directory tree on the left to preview it here.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
