import React, { useState, useEffect } from 'react';
import { Folder, ChevronRight, ArrowLeft, Search, Loader2, X, CheckCircle2, HardDrive, Home, RefreshCw, Key } from 'lucide-react';
import { connectGoogleAPI } from '../../lib/googleAuthService';

export default function DriveFolderPickerModal({
  isOpen,
  onClose,
  onSelectFolder,
  title = 'Select Google Drive Folder',
  initialFolderId = null,
  accessToken = null
}) {
  const [loading, setLoading] = useState(false);
  const [path, setPath] = useState([]); // [{ id, name }]
  const [folders, setFolders] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState(null);
  const [is401Error, setIs401Error] = useState(false);

  const currentToken = accessToken || localStorage.getItem('google_access_token');

  useEffect(() => {
    if (isOpen) {
      const rootId = initialFolderId || 'root';
      setPath([{ id: rootId, name: initialFolderId ? 'Target Directory' : 'My Drive' }]);
      fetchSubfolders(rootId, currentToken);
    }
  }, [isOpen, initialFolderId]);

  const fetchSubfolders = async (folderId, tokenToUse) => {
    const token = tokenToUse || currentToken;
    if (!token) {
      setError('Google Drive access token missing or expired. Please connect your Google account.');
      setIs401Error(true);
      return;
    }

    setLoading(true);
    setError(null);
    setIs401Error(false);

    try {
      const query = `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
      const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,modifiedTime)&pageSize=200`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.status === 401) {
        setIs401Error(true);
        throw new Error('Drive API authorization session expired (Status 401). Please re-authenticate your Google Account.');
      }

      if (!res.ok) {
        throw new Error(`Drive API returned status ${res.status}`);
      }

      const data = await res.json();
      setFolders(data.files || []);
    } catch (err) {
      console.error('Failed to load subfolders:', err);
      setError(err.message || 'Failed to list Drive folders');
    } finally {
      setLoading(false);
    }
  };

  const handleJumpToMyDrive = () => {
    setPath([{ id: 'root', name: 'My Drive' }]);
    setSearchQuery('');
    fetchSubfolders('root', currentToken);
  };

  const handleNavigateTo = (folder) => {
    setPath(prev => [...prev, { id: folder.id, name: folder.name }]);
    setSearchQuery('');
    fetchSubfolders(folder.id, currentToken);
  };

  const handleGoBack = () => {
    if (path.length <= 1) return;
    const newPath = path.slice(0, -1);
    const parent = newPath[newPath.length - 1];
    setPath(newPath);
    setSearchQuery('');
    fetchSubfolders(parent.id, currentToken);
  };

  const handleReconnect = () => {
    connectGoogleAPI('drive_card_sync');
  };

  const currentFolder = path[path.length - 1] || { id: 'root', name: 'My Drive' };
  const filteredFolders = folders.filter(f =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '24px'
    }}>
      <div style={{
        background: '#fff', borderRadius: '20px', width: '100%', maxWidth: '680px', maxHeight: '85vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.3)'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid #e2e8f0', background: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ background: '#f3e8ff', color: '#7c3aed', padding: '8px', borderRadius: '10px', display: 'flex' }}>
              <HardDrive size={20} />
            </span>
            <div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>{title}</h3>
              <p style={{ margin: '2px 0 0 0', color: '#64748b', fontSize: '0.8rem' }}>Browse your Google Drive folder hierarchy &amp; select target output</p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: '#f1f5f9', border: 'none', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', cursor: 'pointer' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Breadcrumb & Navigation Bar */}
        <div style={{ background: '#f8fafc', padding: '12px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflowX: 'auto', fontSize: '0.85rem' }}>
            <button
              onClick={handleJumpToMyDrive}
              style={{ background: '#fff', border: '1px solid #d8b4fe', color: '#7c3aed', borderRadius: '6px', padding: '4px 8px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}
              title="Jump to top-level My Drive root"
            >
              <Home size={14} /> My Drive Root
            </button>

            {path.length > 1 && (
              <button
                onClick={handleGoBack}
                style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '4px 8px', color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <ArrowLeft size={14} /> Back
              </button>
            )}

            {path.map((item, idx) => (
              <React.Fragment key={item.id}>
                <ChevronRight size={14} color="#94a3b8" />
                <span style={{ fontWeight: idx === path.length - 1 ? 700 : 500, color: idx === path.length - 1 ? '#7c3aed' : '#64748b', whiteSpace: 'nowrap' }}>
                  {item.name}
                </span>
              </React.Fragment>
            ))}
          </div>

          <div style={{ position: 'relative', width: '180px', flexShrink: 0 }}>
            <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="Search folders..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '100%', padding: '6px 8px 6px 30px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.8rem', outline: 'none' }}
            />
          </div>
        </div>

        {/* Folder List Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', minHeight: '280px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: '#64748b' }}>
              <Loader2 size={32} className="animate-spin text-purple-600" style={{ margin: '0 auto 8px auto' }} />
              <span>Fetching Drive directories...</span>
            </div>
          ) : error ? (
            <div style={{ padding: '24px', textAlign: 'center', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '14px' }}>
              <p style={{ margin: '0 0 16px 0', color: '#dc2626', fontWeight: 600, fontSize: '0.9rem' }}>{error}</p>
              {is401Error && (
                <button
                  onClick={handleReconnect}
                  style={{
                    background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
                    color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px',
                    fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px',
                    boxShadow: '0 2px 8px rgba(124, 58, 237, 0.3)'
                  }}
                >
                  <Key size={16} /> Connect / Refresh Google Account
                </button>
              )}
            </div>
          ) : filteredFolders.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: '#94a3b8' }}>
              <Folder size={40} style={{ margin: '0 auto 8px auto', display: 'block', opacity: 0.5 }} />
              <span style={{ fontSize: '0.9rem', display: 'block', marginBottom: '8px' }}>
                No subfolders inside "{currentFolder.name}"
              </span>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>
                You can select "{currentFolder.name}" as your output folder below, or click "My Drive Root" above to browse other folders.
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
              {filteredFolders.map((folder) => (
                <div
                  key={folder.id}
                  onClick={() => handleNavigateTo(folder)}
                  style={{
                    background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px 14px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                  onMouseOver={e => {
                    e.currentTarget.style.borderColor = '#7c3aed';
                    e.currentTarget.style.background = '#faf5ff';
                  }}
                  onMouseOut={e => {
                    e.currentTarget.style.borderColor = '#e2e8f0';
                    e.currentTarget.style.background = '#fff';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                    <Folder size={20} color="#7c3aed" style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {folder.name}
                    </span>
                  </div>
                  <ChevronRight size={16} color="#94a3b8" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
            Selected Folder: <strong style={{ color: '#7c3aed' }}>{currentFolder.name}</strong>
          </span>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={onClose}
              style={{ background: '#fff', border: '1px solid #cbd5e1', padding: '8px 16px', borderRadius: '8px', fontWeight: 600, color: '#475569', cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              onClick={() => {
                onSelectFolder({ id: currentFolder.id, name: currentFolder.name });
                onClose();
              }}
              style={{
                background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
                color: '#fff', border: 'none', padding: '8px 20px', borderRadius: '8px', fontWeight: 700,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
              }}
            >
              <CheckCircle2 size={16} /> Select Current Folder
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
