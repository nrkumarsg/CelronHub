import React, { useState, useEffect } from 'react';
import { 
    Folder, FolderOpen, FileText, Image as ImageIcon, File, Eye, Download, 
    ExternalLink, Upload, RefreshCcw, Search, ChevronRight, ChevronDown, 
    Sparkles, HardDrive, CheckCircle2, AlertCircle, Loader2, Plus, X 
} from 'lucide-react';
import { listFolderContent, uploadFileToDrive, deleteFile } from '../../lib/driveService';
import { validateToken } from '../../lib/googleAuthService';
import GDriveConnectionModal from '../common/GDriveConnectionModal';
import toast from 'react-hot-toast';

export default function EagleDriveTreeViewer({ 
    jobFolderId, 
    jobNo = 'CEL-2607-6100', 
    customerName = '', 
    companyId = '' 
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

    const accessToken = localStorage.getItem('google_access_token');

    useEffect(() => {
        checkAuthAndLoad();
    }, [jobFolderId, accessToken]);

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

    const handleFileUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const targetFolder = activeFolder?.id || jobFolderId;
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

            toast.success(`Uploaded ${file.name} to Drive`);
            await loadFolderStructure();
            if (uploaded) setSelectedFile(uploaded);
        } catch (err) {
            console.error('Upload error:', err);
            toast.error(err.message || 'File upload failed');
        } finally {
            setUploading(false);
            setUploadProgress(0);
        }
    };

    const getFileIcon = (mimeType) => {
        if (mimeType?.includes('image/')) return <ImageIcon size={18} style={{ color: '#10b981' }} />;
        if (mimeType?.includes('pdf')) return <FileText size={18} style={{ color: '#ef4444' }} />;
        return <File size={18} style={{ color: '#3b82f6' }} />;
    };

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
                        <span style={{ fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{node.name}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
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
                                    onClick={() => setSelectedFile(file)}
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
                                    <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</span>
                                    {file.size && (
                                        <span style={{ fontSize: '0.7rem', color: isFileSelected ? '#c7d2fe' : '#94a3b8' }}>
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

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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
                    <label style={{ background: '#4f46e5', color: '#ffffff', padding: '6px 14px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 2px 6px rgba(79,70,229,0.3)' }}>
                        <Upload size={14} /> Upload File
                        <input type="file" onChange={handleFileUpload} style={{ display: 'none' }} />
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

            {/* Main Split Layout: Left Folder Tree (35%) | Right Viewer Pane (65%) */}
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '340px 1fr', minHeight: '520px' }}>
                {/* Left Pane: Folder Tree */}
                <div style={{ padding: '16px', overflowY: 'auto', maxHeight: '650px', background: '#f8fafc', borderRight: '1px solid #e2e8f0' }}>
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
                        <div style={{ textAlign: 'center', padding: '48px 0', color: '#64748b', fontSize: '0.8rem' }}>
                            <AlertCircle size={28} style={{ margin: '0 auto 8px', color: '#94a3b8' }} />
                            No Drive folders found for job <strong>{jobNo}</strong>.
                        </div>
                    )}
                </div>

                {/* Right Pane: Live File Previewer */}
                <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', background: '#ffffff' }}>
                    {selectedFile ? (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
                            {/* File Info Bar */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '12px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', overflow: 'hidden' }}>
                                    {getFileIcon(selectedFile.mimeType)}
                                    <div style={{ overflow: 'hidden' }}>
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

                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', shrink: 0 }}>
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
                                </div>
                            </div>

                            {/* Live File Viewer Box */}
                            <div style={{ flex: 1, background: '#0f172a', borderRadius: '12px', overflow: 'hidden', border: '1px solid #1e293b', minHeight: '450px', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                                {selectedFile.mimeType?.includes('image/') ? (
                                    <img
                                        src={`https://lh3.googleusercontent.com/d/${selectedFile.id}=w1200`}
                                        alt={selectedFile.name}
                                        style={{ maxHeight: '480px', maxWidth: '100%', objectFit: 'contain', padding: '8px' }}
                                    />
                                ) : null}

                                {selectedFile.mimeType?.includes('pdf') || selectedFile.mimeType?.includes('document') || selectedFile.mimeType?.includes('sheet') ? (
                                    <iframe
                                        src={`https://drive.google.com/file/d/${selectedFile.id}/preview`}
                                        title={selectedFile.name}
                                        style={{ width: '100%', height: '480px', border: 'none' }}
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
