import React, { useState, useEffect } from 'react';
import { 
    Folder, File, ChevronRight, Search, 
    ArrowLeft, Loader2, ExternalLink, HardDrive, 
    Clock, Calendar, Briefcase, Shield, Smartphone, 
    Grid, List, FileText, FileImage, FileCode
} from 'lucide-react';
import { listFolderContent } from '../../lib/driveService';
import { initializeVault } from '../../lib/vaultService';
import { useAuth } from '../../contexts/AuthContext';

/**
 * DriveExplorer - A mobile-optimized file browser for the CELRONHUB structure.
 */
export default function DriveExplorer({ initialFolderId = null, folderName = null }) {
    const { profile } = useAuth();
    const [loading, setLoading] = useState(false);
    const [path, setPath] = useState([]); // Array of { id, name }
    const [items, setItems] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'
    const [error, setError] = useState(null);

    useEffect(() => {
        if (profile) {
            const rootIds = [
                '1Bui_mkB4d3Ae9Ll-3UHlWXYAauJz-d3w',
                '1kCdb5celO1Ubo3SQZWCYj96eEmc1VAeJ',
                profile.gdrive_celron_root_id,
                profile.google_drive_folder_id
            ].filter(Boolean);

            const isRoot = !initialFolderId || rootIds.includes(initialFolderId);

            if (initialFolderId && !isRoot) {
                setPath([
                    { id: 'CELRON_ROOT', name: 'CELRON ROOT' },
                    { id: initialFolderId, name: folderName || 'Enquiry Folder' }
                ]);
                fetchFolderItems(initialFolderId);
            } else {
                setupExplorer();
            }
        }
    }, [profile, initialFolderId, folderName]);

    const setupExplorer = async () => {
        setLoading(true);
        setError(null);
        try {
            const accessToken = localStorage.getItem('google_access_token');
            if (!accessToken) throw new Error("Google Drive not connected");

            const roots = await initializeVault(accessToken, profile.company_id);
            
            // Initial view: Main Tiers
            const initialItems = [
                { id: roots.timeBasedId, name: '01. TIME_BASED', type: 'folder', icon: <Clock size={20} color="#3b82f6" />, description: 'Jobs & Year-wise records' },
                { id: roots.permanentId, name: '02. PERMANENT_RECORDS', type: 'folder', icon: <Shield size={20} color="#10b981" />, description: 'Company legal & master docs' },
                { id: roots.shortTermId, name: '03. SHORT_TERM_PROJECTS', type: 'folder', icon: <Calendar size={20} color="#f59e0b" />, description: 'Active project materials' },
                { id: roots.corpVaultId, name: '04. CORPORATE_VAULT', type: 'folder', icon: <Briefcase size={20} color="#8b5cf6" />, description: 'Standards & Stationery' },
                { id: roots.inventoryId, name: '05. INVENTORY_CATALOG', type: 'folder', icon: <HardDrive size={20} color="#ef4444" />, description: 'Product photos & sheets' },
                { id: roots.scansInboxId, name: '99. SCANS_INBOX', type: 'folder', icon: <Smartphone size={20} color="#6366f1" />, description: 'Incoming scans from phone' }
            ];
            
            setItems(initialItems);
            setPath([{ id: roots.celronRootId, name: 'CELRONHUB' }]);
        } catch (err) {
            console.error('Explorer setup error:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const navigateTo = async (folderId, folderName) => {
        setLoading(true);
        setError(null);
        try {
            const accessToken = localStorage.getItem('google_access_token');
            const files = await listFolderContent(accessToken, folderId);
            
            setItems(files.map(f => ({
                id: f.id,
                name: f.name,
                type: f.mimeType === 'application/vnd.google-apps.folder' ? 'folder' : 'file',
                mimeType: f.mimeType,
                webViewLink: f.webViewLink,
                thumbnailLink: f.thumbnailLink,
                modifiedTime: f.modifiedTime
            })));
            
            setPath(prev => [...prev, { id: folderId, name: folderName }]);
            setSearchTerm('');
        } catch (err) {
            console.error('Navigation error:', err);
            setError("Failed to load folder content");
        } finally {
            setLoading(false);
        }
    };

    const goBack = () => {
        if (path.length <= 1) return;
        const newPath = path.slice(0, -1);
        const parent = newPath[newPath.length - 1];
        setPath(newPath);
        
        if (newPath.length === 1) {
            setupExplorer(); // Go back to root
        } else {
            fetchFolderItems(parent.id);
        }
    };

    const fetchFolderItems = async (id) => {
        setLoading(true);
        try {
            const accessToken = localStorage.getItem('google_access_token');
            const files = await listFolderContent(accessToken, id);
            setItems(files.map(f => ({
                id: f.id,
                name: f.name,
                type: f.mimeType === 'application/vnd.google-apps.folder' ? 'folder' : 'file',
                mimeType: f.mimeType,
                webViewLink: f.webViewLink,
                thumbnailLink: f.thumbnailLink
            })));
        } catch (err) {
            setError("Failed to refresh items");
        } finally {
            setLoading(false);
        }
    };

    const getFileIcon = (mimeType) => {
        if (mimeType.includes('pdf')) return <FileText size={20} color="#ef4444" />;
        if (mimeType.includes('image')) return <FileImage size={20} color="#10b981" />;
        if (mimeType.includes('sheet') || mimeType.includes('excel')) return <FileCode size={20} color="#059669" />;
        return <File size={20} color="#94a3b8" />;
    };

    const filteredItems = items.filter(i => 
        i.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const currentFolder = path[path.length - 1];

    return (
        <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', height: '100%', minHeight: '480px', display: 'flex', flexDirection: 'column' }}>
            {/* Header / Search */}
            <div style={{ padding: '16px', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <div style={{ flex: 1, position: 'relative' }}>
                        <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} size={18} />
                        <input 
                            type="text" 
                            placeholder={`Search in ${currentFolder?.name}...`}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{ width: '100%', padding: '10px 10px 10px 40px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '0.9rem', outline: 'none' }}
                        />
                    </div>
                    <div style={{ display: 'flex', background: '#f8fafc', padding: '4px', borderRadius: '8px' }}>
                        <button onClick={() => setViewMode('grid')} style={{ padding: '6px', background: viewMode === 'grid' ? '#fff' : 'transparent', border: 'none', borderRadius: '6px', cursor: 'pointer', boxShadow: viewMode === 'grid' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none' }}>
                            <Grid size={18} color={viewMode === 'grid' ? '#6366f1' : '#64748b'} />
                        </button>
                        <button onClick={() => setViewMode('list')} style={{ padding: '6px', background: viewMode === 'list' ? '#fff' : 'transparent', border: 'none', borderRadius: '6px', cursor: 'pointer', boxShadow: viewMode === 'list' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none' }}>
                            <List size={18} color={viewMode === 'list' ? '#6366f1' : '#64748b'} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Path / Breadcrumbs */}
            <div style={{ padding: '8px 16px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '8px', overflowX: 'auto' }}>
                {path.length > 1 && (
                    <button onClick={goBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#64748b' }}>
                        <ArrowLeft size={16} />
                    </button>
                )}
                {path.map((p, idx) => (
                    <React.Fragment key={p.id + idx}>
                        <button 
                            onClick={() => {
                                if (idx === path.length - 1) return;
                                const newPath = path.slice(0, idx + 1);
                                setPath(newPath);
                                if (idx === 0) setupExplorer();
                                else fetchFolderItems(p.id);
                            }}
                            style={{ 
                                background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                                fontSize: '0.75rem', fontWeight: 700, 
                                color: idx === path.length - 1 ? '#6366f1' : '#94a3b8', 
                                whiteSpace: 'nowrap' 
                            }}
                        >
                            {p.name}
                        </button>
                        {idx < path.length - 1 && <ChevronRight size={14} color="#cbd5e1" />}
                    </React.Fragment>
                ))}
            </div>

            {/* List Area */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
                {loading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '12px', color: '#94a3b8' }}>
                        <Loader2 className="animate-spin" size={32} />
                        <p style={{ fontSize: '0.85rem' }}>Accessing CelronHub Drive...</p>
                    </div>
                ) : error ? (
                    <div style={{ textAlign: 'center', padding: '40px 20px', color: '#ef4444' }}>
                        <Shield size={40} style={{ marginBottom: '12px' }} />
                        <p>{error}</p>
                        <button onClick={setupExplorer} style={{ marginTop: '12px', padding: '8px 16px', borderRadius: '8px', border: '1px solid #ef4444', background: 'none', color: '#ef4444', cursor: 'pointer' }}>Retry</button>
                    </div>
                ) : filteredItems.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
                        <Folder size={48} style={{ marginBottom: '16px', opacity: 0.2 }} />
                        <p>No items found in this location</p>
                    </div>
                ) : viewMode === 'list' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {filteredItems.map(item => (
                            <div 
                                key={item.id}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '12px', padding: '12px',
                                    borderRadius: '12px', cursor: 'pointer', transition: 'all 0.2s',
                                    border: '1px solid transparent'
                                }}
                                onClick={() => item.type === 'folder' ? navigateTo(item.id, item.name) : window.open(item.webViewLink, '_blank')}
                                onMouseOver={(e) => {
                                    e.currentTarget.style.background = '#f1f5f9';
                                    e.currentTarget.style.borderColor = '#e2e8f0';
                                }}
                                onMouseOut={(e) => {
                                    e.currentTarget.style.background = 'none';
                                    e.currentTarget.style.borderColor = 'transparent';
                                }}
                            >
                                <div style={{ width: '40px', height: '40px', background: '#f8fafc', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #f1f5f9' }}>
                                    {item.type === 'folder' ? (item.icon || <Folder size={20} color="#3b82f6" />) : getFileIcon(item.mimeType)}
                                </div>
                                <div style={{ flex: 1, overflow: 'hidden' }}>
                                    <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</p>
                                    {item.description && <p style={{ margin: 0, fontSize: '0.75rem', color: '#94a3b8' }}>{item.description}</p>}
                                </div>
                                 {item.type === 'folder' ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <a
                                            href={item.webViewLink || `https://drive.google.com/drive/folders/${item.id}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={(e) => e.stopPropagation()}
                                            title={`Open folder "${item.name}" in Google Drive (new window)`}
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '4px',
                                                padding: '4px 8px',
                                                borderRadius: '6px',
                                                fontSize: '0.75rem',
                                                fontWeight: 700,
                                                color: '#4f46e5',
                                                background: '#eef2ff',
                                                border: '1px solid rgba(79,70,229,0.2)',
                                                textDecoration: 'none'
                                            }}
                                        >
                                            <ExternalLink size={12} /> Drive
                                        </a>
                                        <ChevronRight size={16} color="#cbd5e1" />
                                    </div>
                                ) : <ExternalLink size={14} color="#cbd5e1" />}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '16px' }}>
                        {filteredItems.map(item => (
                            <div 
                                key={item.id}
                                onClick={() => item.type === 'folder' ? navigateTo(item.id, item.name) : window.open(item.webViewLink, '_blank')}
                                style={{
                                    padding: '16px', borderRadius: '16px', border: '1px solid #e2e8f0',
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
                                    cursor: 'pointer', transition: 'all 0.2s', textAlign: 'center', position: 'relative'
                                }}
                                onMouseOver={(e) => e.currentTarget.style.borderColor = '#6366f1'}
                                onMouseOut={(e) => e.currentTarget.style.borderColor = '#e2e8f0'}
                            >
                                <div style={{ width: '64px', height: '64px', background: '#f8fafc', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    {item.type === 'folder' ? (item.icon || <Folder size={32} color="#3b82f6" />) : getFileIcon(item.mimeType)}
                                </div>
                                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1e293b', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                                    {item.name}
                                </span>
                                {item.type === 'folder' && (
                                    <a
                                        href={item.webViewLink || `https://drive.google.com/drive/folders/${item.id}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        title={`Open folder "${item.name}" in Google Drive (new window)`}
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            padding: '2px 6px',
                                            borderRadius: '6px',
                                            fontSize: '0.7rem',
                                            fontWeight: 700,
                                            color: '#4f46e5',
                                            background: '#eef2ff',
                                            border: '1px solid rgba(79,70,229,0.2)',
                                            textDecoration: 'none',
                                            marginTop: '4px'
                                        }}
                                    >
                                        <ExternalLink size={11} /> Open Drive
                                    </a>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
